import { Router, type IRouter } from "express";
import { requireAuth, requireReauth, requireSuperadmin } from "../auth";
import { logActivity } from "../activity-log";
import {
  ActivationError,
  SyncError,
  activateKiosk,
  getDeviceInfo,
  syncPending,
} from "../device";

const router: IRouter = Router();

// Device information (device_uid, kiosk_id, activation, api key status, sync state)
router.get("/device/info", requireAuth, async (_req, res) => {
  try {
    res.json(await getDeviceInfo());
  } catch (e) {
    res.status(500).json({ error: "Failed to load device information" });
  }
});

// One-time provisioning: exchange the admin-supplied activation code for a
// server-assigned kioskId + API key. Requires an internet connection.
router.post(
  "/device/activate",
  requireAuth,
  requireSuperadmin,
  requireReauth,
  async (req, res) => {
    try {
      const activationCode = (req.body?.activationCode ?? "").toString().trim();
      if (!activationCode) {
        res.status(400).json({ error: "Activation code is required" });
        return;
      }

      const info = await activateKiosk(activationCode);
      await logActivity(
        req.user?.id ?? null,
        "Device Activated",
        `Kiosk ${info.kioskId ?? "unknown"} (${info.deviceUid}) was activated by ${req.user?.username ?? "Unknown"}`,
      );
      res.json(info);
    } catch (e) {
      if (e instanceof ActivationError) {
        res.status(400).json({ error: e.message, code: e.code });
        return;
      }
      res.status(502).json({ error: "Failed to reach server" });
    }
  },
);

// Trigger an offline-first sync now (manual export).
router.post(
  "/device/sync",
  requireAuth,
  requireSuperadmin,
  requireReauth,
  async (req, res) => {
    try {
      const result = await syncPending();
      await logActivity(
        req.user?.id ?? null,
        "Reports Exported",
        `${result.exported} record(s) synced to server by ${req.user?.username ?? "Unknown"}`,
      );
      res.json({ success: true, ...result });
    } catch (e) {
      if (e instanceof SyncError) {
        res.status(e.permanent ? 400 : 502).json({ error: e.message, code: e.code });
        return;
      }
      res.status(502).json({ error: "Failed to sync records" });
    }
  },
);

export default router;
