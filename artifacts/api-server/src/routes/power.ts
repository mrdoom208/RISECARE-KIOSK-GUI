import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import { requireAuth, requireReauth, sensitiveLimiter } from "../auth";
import { publish } from "../mqtt";
import { logger } from "../logger";
import { logActivity } from "../activity-log";
import { logSystem } from "../system-log";

// Power commands: shutdown / restart / lock via MQTT, exit-kiosk by
// terminating the local Chromium kiosk processes.

const router: IRouter = Router();

interface ChromiumProcessScan {
  pids: number[];
  inspected: number;
  processNames: string[];
  readErrors: string[];
}

async function findChromiumPids(): Promise<ChromiumProcessScan> {
  if (process.platform !== "linux") {
    return { pids: [], inspected: 0, processNames: [], readErrors: [] };
  }

  const entries = await fs.promises.readdir("/proc", { withFileTypes: true });
  const pids: number[] = [];
  const processNames = new Set<string>();
  const readErrors: string[] = [];
  let inspected = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    inspected += 1;
    let processName = "";
    try {
      processName = (await fs.promises.readFile(
        `/proc/${entry.name}/comm`,
        "utf8",
      )).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (readErrors.length < 5) {
        readErrors.push(
          `PID ${entry.name} comm: ${(error as Error).message}`,
        );
      }
    }

    if (processName) processNames.add(processName);
    const isChromiumName =
      /^(chromium(?:-browser)?|chrome|google-chrome(?:-stable)?)$/i.test(
        processName,
      );

    if (isChromiumName) {
      pids.push(Number(entry.name));
      continue;
    }

    try {
      const args = (await fs.promises.readFile(
        `/proc/${entry.name}/cmdline`,
      ))
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      const executable = path.basename(args[0] ?? "");
      if (
        /^(chromium(?:-browser)?|chrome|google-chrome(?:-stable)?)$/i.test(
          executable,
        )
      ) {
        pids.push(Number(entry.name));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (readErrors.length < 5) {
        readErrors.push(
          `PID ${entry.name} cmdline: ${(error as Error).message}`,
        );
      }
    }
  }

  return {
    pids,
    inspected,
    processNames: [...processNames].slice(0, 10),
    readErrors,
  };
}

type PowerCommand = "shutdown" | "restart" | "lock" | "exit-kiosk";

const POWER_COMMAND_LABEL: Record<PowerCommand, string> = {
  shutdown: "Shutdown",
  restart: "Restart",
  lock: "Lock",
  "exit-kiosk": "Exit Program",
};

// Send a power command (shutdown / restart / lock) via MQTT, or exit local kiosk Chromium.
async function sendPowerCommand(
  req: any,
  res: any,
  action: PowerCommand,
) {
  try {
    const actionLabel = POWER_COMMAND_LABEL[action];

    if (action === "exit-kiosk") {
      const scan = await findChromiumPids();
      const { pids } = scan;
      if (pids.length === 0) {
        logger.error("System", "Exit Program failed because Chromium was not found", {
          platform: process.platform,
          procPath: "/proc",
          inspectedPidEntries: scan.inspected,
          processNames: scan.processNames,
          readErrors: scan.readErrors,
          note:
            "The scan only sees processes visible in the API server's process namespace.",
        });
        res.status(409).json({
          error: "Kiosk Chromium was not found on the API server host",
        });
        return;
      }

      await logActivity(
        req.user?.id ?? null,
        `System ${actionLabel}`,
        `User ${req.user?.username ?? "Unknown"} exited kiosk mode`,
      );
      void logSystem("INFO", "System", "Kiosk program exited", {
        by: req.user?.username ?? "Unknown",
      });

      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }

      res.json({ success: true, action, message: "Kiosk program exited" });
      return;
    }

    await logActivity(
      req.user?.id ?? null,
      `System ${actionLabel}`,
      `User ${req.user?.username ?? "Unknown"} initiated system ${action}`,
    );
    void logSystem("INFO", "System", `System ${action} requested`, {
      by: req.user?.username ?? "Unknown",
    });

    const sent = publish(`risecare/command/${action}`, {
      sensor: action,
      value: 1,
      timestamp: new Date().toISOString(),
    });

    if (sent) {
      res.json({ success: true, action, message: `${actionLabel} command sent` });
    } else {
      res.status(503).json({ error: "MQTT not connected" });
    }
  } catch (e) {
    logger.error("System", `Could not execute the ${action} power command`, e);
    res.status(500).json({ error: `Failed to send ${action} command` });
  }
}

// Power commands: shutdown / restart / lock (authenticated, requires recent re-auth)
router.post("/power", requireAuth, requireReauth, sensitiveLimiter, async (req, res) => {
  const { action } = req.body ?? {};
  if (action !== "shutdown" && action !== "restart" && action !== "lock"
      && action !== "exit-kiosk") {
    res.status(400).json({
      error: "Action must be 'shutdown', 'restart', 'lock', or 'exit-kiosk'",
    });
    return;
  }
  await sendPowerCommand(req, res, action);
});

// Backward-compatible alias for shutdown
router.post("/shutdown", requireAuth, requireReauth, sensitiveLimiter, async (req, res) => {
  await sendPowerCommand(req, res, "shutdown");
});

export default router;
