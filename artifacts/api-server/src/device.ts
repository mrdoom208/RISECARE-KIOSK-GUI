import crypto from "crypto";
import { query, run } from "@workspace/db";
import { logger } from "./logger";
import { postJsonWithBackoff } from "./retry";
import { logSystem } from "./system-log";
import { sanitizeSessions, sanitizeVitals } from "./sync-sanitize";

// Debug hook for the kiosk's outbound sync. Set SYNC_DEBUG=1 to dump the exact
// payload sent to the portal and the raw response. Includes patient-identifiable
// data, so only enable it while debugging.
function syncDebug(message: string, details?: unknown): void {
  if (process.env.SYNC_DEBUG === "1") {
    logger.debug("Sync", message, details);
  }
}

// The background loop retries every 30s, so an unreachable portal would
// otherwise write the same log entry thousands of times per day. Repeat errors
// are written at most once every 10 minutes.
let lastSyncErrorSignature = "";
let lastSyncErrorLoggedAt = 0;

// Last time the portal confirmed the kiosk is present: either a successful
// heartbeat or a successful record sync (which also refreshes presence).
// Used so the heartbeat loop does not send a redundant ping right after a sync.
let lastPresenceAt = 0;

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function logSyncError(
  level: "ERROR" | "WARNING",
  message: string,
  details: Record<string, unknown>,
): void {
  const signature = `${message}:${JSON.stringify(details)}`;
  const now = Date.now();
  if (
    signature === lastSyncErrorSignature &&
    now - lastSyncErrorLoggedAt < 10 * 60 * 1000
  ) {
    return;
  }
  lastSyncErrorSignature = signature;
  lastSyncErrorLoggedAt = now;
  void logSystem(level, "Sync", message, details);
}

export interface SyncState {
  pending: number;
  synced: number;
}

export interface DeviceInfo {
  deviceUid: string;
  kioskId: string | null;
  kioskName: string | null;
  kioskSite: string | null;
  activated: boolean;
  apiKeyConfigured: boolean;
  createdAt: string | null;
  syncState: SyncState;
}

function randomUuid(): string {
  return crypto.randomUUID();
}

async function getSyncState(): Promise<SyncState> {
  const rows = await query(
    "SELECT sync_status, COUNT(*) AS count FROM sessions WHERE completed_at IS NOT NULL GROUP BY sync_status",
  );
  let pending = 0;
  let synced = 0;
  for (const row of rows) {
    if (row.sync_status === "synced") synced = Number(row.count);
    else pending += Number(row.count);
  }
  return { pending, synced };
}

// Generates the permanent kiosk identity on first boot and persists it in the
// local sqlite database. Subsequent boots always return the same identity.
// Only the deviceUid is generated locally; the kioskId is assigned by the server.
export async function ensureDeviceIdentity(): Promise<Record<string, any>> {
  const existing = await query("SELECT * FROM device WHERE id = 1");
  if (existing && existing.length > 0) return existing[0];

  await run(
    "INSERT INTO device (id, device_uid, kiosk_id, activation_code) VALUES (1, ?, '', '')",
    [randomUuid()],
  );
  const inserted = await query("SELECT * FROM device WHERE id = 1");
  return inserted[0];
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const row = await ensureDeviceIdentity();
  const syncState = await getSyncState();
  return {
    deviceUid: row.device_uid,
    kioskId: row.kiosk_id || null,
    kioskName: row.kiosk_name || null,
    kioskSite: row.kiosk_site || null,
    activated: Boolean(row.activated),
    apiKeyConfigured: Boolean(row.api_key),
    createdAt: row.created_at ?? null,
    syncState,
  };
}

// Tags for offline transactions. Called at insert time so every record carries
// the local deviceUid and the (server-assigned) kioskId.
export async function getTransactionTags(): Promise<{
  deviceUid: string;
  kioskId: string | null;
}> {
  const row = await ensureDeviceIdentity();
  return { deviceUid: row.device_uid, kioskId: row.kiosk_id || null };
}

// Resolves the RiseCare Admin Portal base URL. Precedence: RISECARE_PORTAL_URL
// env var > configured server_link setting > environment default (dev:
// http://localhost:3001, prod: https://portal.example.com).
export async function getPortalBaseUrl(): Promise<string> {
  const envUrl = process.env.RISECARE_PORTAL_URL?.trim();
  if (envUrl) return envUrl;
  const rows = await query("SELECT value FROM settings WHERE key = 'server_link'");
  const saved = rows && rows.length > 0 ? (rows[0].value ?? "").trim() : "";
  if (saved) return saved;
  return process.env.NODE_ENV === "production"
    ? "https://portal.example.com"
    : "http://localhost:3001";
}

export class ActivationError extends Error {
  code: string;
  constructor(message: string, code = "activation_failed") {
    super(message);
    this.name = "ActivationError";
    this.code = code;
  }
}

export class SyncError extends Error {
  code: string;
  permanent: boolean;
  constructor(message: string, code = "sync_failed", permanent = false) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.permanent = permanent;
  }
}

// One-time activation against the RiseCare Admin Portal. The admin-supplied
// activation key plus the persistent deviceUid are exchanged for a
// server-assigned kioskId and an API key:
//   POST {portal}/api/v1/kiosks/activate
//   body: { activationCode, deviceUid }
//   -> 201: { kiosk: { id, name, site, deviceUid }, apiKey }
// The portal base URL is RISECARE_PORTAL_URL > server_link setting > default
// (dev http://localhost:3001, prod https://portal.example.com). The deviceUid
// is never regenerated on failure.
export async function activateKiosk(activationCode: string): Promise<DeviceInfo> {
  const portalBase = await getPortalBaseUrl();

  const device = await ensureDeviceIdentity();
  const { status, data } = await postJsonWithBackoff(
    `${portalBase.replace(/\/$/, "")}/api/v1/kiosks/activate`,
    { activationCode, deviceUid: device.device_uid },
    {},
    { attempts: 4 },
  );

  if (status === 201) {
    const kiosk = data?.kiosk ?? {};
    const apiKey = data?.apiKey ?? "";
    if (!kiosk.id || !apiKey) {
      throw new ActivationError(
        "The server returned an incomplete activation response",
        "bad_response",
      );
    }
    await run(
      "UPDATE device SET kiosk_id = ?, kiosk_name = ?, kiosk_site = ?, api_key = ?, activated = 1 WHERE id = 1",
      [
        String(kiosk.id),
        kiosk.name ? String(kiosk.name) : null,
        kiosk.site ? String(kiosk.site) : null,
        String(apiKey),
      ],
    );
    return getDeviceInfo();
  }

  if (status === 400) {
    throw new ActivationError(
      "Invalid activation code. Ask the admin for a fresh code.",
      "invalid_code",
    );
  }
  if (status === 410) {
    throw new ActivationError(
      "This activation code has expired. Ask the admin for a fresh code.",
      "expired_code",
    );
  }
  if (status === 409) {
    throw new ActivationError(
      "This activation code has already been used, or this device is already registered.",
      "already_used",
    );
  }
  throw new ActivationError(
    `Activation failed (HTTP ${status}). Please try again.`,
    "unknown",
  );
}

interface PendingRecord {
  id: number;
  [key: string]: any;
}

// Offline-first sync: sends all pending sessions + vitals in one batch to
// POST /api/v1/sync/kiosk. The batch payloadId doubles as the Idempotency-Key
// and is persisted so an interrupted request is safely replayed. Records are
// only marked synced after a successful 200 and are never deleted on error.
export async function syncPending(): Promise<{ exported: number }> {
  const device = await ensureDeviceIdentity();
  const portalBase = await getPortalBaseUrl();

  if (!device.api_key) {
    throw new SyncError("This kiosk is not activated yet", "not_activated", true);
  }
  if (!device.kiosk_id) {
    // The portal identifies the kiosk by API key, but a missing server-assigned
    // ID means activation did not finish locally. Sending `kioskId: null`
    // would be rejected forever, so surface the real problem instead.
    throw new SyncError(
      "This kiosk is missing its server-assigned kiosk ID. Re-activate it with a fresh code.",
      "missing_kiosk_id",
      true,
    );
  }

  const sessions: PendingRecord[] = await query(`
    SELECT id, COALESCE(NULLIF(source_session_id, ''), CAST(id AS TEXT)) AS sourceSessionId, token,
      patient_first_name AS patientFirstName, patient_last_name AS patientLastName,
      patient_phone AS patientPhone, patient_age AS patientAge,
      CASE
        WHEN lower(patient_gender) = 'male' THEN 'Male'
        WHEN lower(patient_gender) = 'female' THEN 'Female'
        WHEN lower(patient_gender) = 'other' THEN 'Other'
        WHEN lower(patient_gender) = 'unknown' THEN 'Unknown'
        ELSE patient_gender
      END AS patientGender, strftime('%Y-%m-%dT%H:%M:%fZ', started_at) AS startedAt,
      CASE WHEN completed_at IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) ELSE NULL END AS completedAt
    FROM sessions
    WHERE completed_at IS NOT NULL
      AND (sync_status = 'pending'
        OR id IN (SELECT session_id FROM vital_readings WHERE sync_status = 'pending'))
    ORDER BY started_at ASC
  `);

  const vitals: PendingRecord[] = await query(`
    SELECT vr.id, COALESCE(NULLIF(vr.source_vital_id, ''), CAST(vr.id AS TEXT)) AS sourceVitalId,
      COALESCE(NULLIF(s.source_session_id, ''), CAST(s.id AS TEXT)) AS sourceSessionId,
      vr.blood_pressure_systolic AS bloodPressureSystolic,
      vr.blood_pressure_diastolic AS bloodPressureDiastolic,
      vr.blood_pressure_pulse AS bloodPressurePulse,
      vr.heart_rate AS heartRate, vr.oxygen_saturation AS oxygenSaturation,
      vr.temperature, vr.weight, vr.height, vr.bmi, vr.notes,
      strftime('%Y-%m-%dT%H:%M:%fZ', vr.recorded_at) AS recordedAt
    FROM vital_readings vr
    JOIN sessions s ON s.id = vr.session_id
    WHERE vr.sync_status = 'pending' AND s.completed_at IS NOT NULL
    ORDER BY vr.recorded_at ASC
  `);

  const total = sessions.length + vitals.length;
  if (total === 0) {
    // Nothing to send; drop any stale in-flight batch marker.
    await run("DELETE FROM settings WHERE key = 'sync_payload_id'");
    return { exported: 0 };
  }

  const droppedFields = sanitizeSessions(sessions) + sanitizeVitals(vitals);
  if (droppedFields > 0) {
    // Count only — never log patient values.
    void logSystem("WARNING", "Sync", "Omitted out-of-range values from sync payload", {
      fields: droppedFields,
    });
  }

  void logSystem("INFO", "Sync", "Preparing records for server sync", {
    sessions: sessions.length,
    vitals: vitals.length,
    records: total,
  });

  // Resume an interrupted batch (same payloadId => server returns the original
  // result) or start a new one.
  const keyRows = await query("SELECT value FROM settings WHERE key = 'sync_payload_id'");
  let payloadId = keyRows && keyRows.length > 0 ? keyRows[0].value : "";
  if (!payloadId) {
    payloadId = randomUuid();
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sync_payload_id', ?)", [
      payloadId,
    ]);
  }

  await run("UPDATE sessions SET payload_id = ? WHERE sync_status = 'pending' AND completed_at IS NOT NULL", [payloadId]);
  await run(
    "UPDATE vital_readings SET payload_id = ? WHERE sync_status = 'pending' AND session_id IN (SELECT id FROM sessions WHERE completed_at IS NOT NULL)",
    [payloadId],
  );

  const payload = {
    source: "risecare-kiosk",
    schemaVersion: 1,
    kioskId: device.kiosk_id || null,
    deviceUid: device.device_uid,
    payloadId,
    exportedAt: new Date().toISOString(),
    sessions,
    vitals,
  };

  const syncUrl = `${portalBase.replace(/\/$/, "")}/api/v1/sync/kiosk`;
  syncDebug("Sending sync request", { method: "POST", url: syncUrl });
  syncDebug("Request headers", {
    "X-RiseCare-Kiosk-Key": device.api_key
      ? `rk_live… (${device.api_key.length} chars)`
      : "none",
    "Idempotency-Key": payloadId,
  });
  syncDebug("Sync payload", payload);

  const { status, data } = await postJsonWithBackoff(syncUrl, payload, {
    "X-RiseCare-Kiosk-Key": device.api_key,
    "Idempotency-Key": payloadId,
  }, { attempts: 5 });

  if (status !== 200) {
    syncDebug("Server response", { status, data });
  }

  if (status === 200) {
    await run(
      "UPDATE sessions SET sync_status = 'synced' WHERE payload_id = ? AND completed_at IS NOT NULL",
      [payloadId],
    );
    await run(
      "UPDATE vital_readings SET sync_status = 'synced' WHERE payload_id = ? AND session_id IN (SELECT id FROM sessions WHERE completed_at IS NOT NULL)",
      [payloadId],
    );
    await run("DELETE FROM settings WHERE key = 'sync_payload_id'");
    void logSystem("INFO", "Sync", "Records synced to server successfully", {
      records: total,
    });
    // The portal treats a successful sync as presence, so no separate
    // heartbeat is needed at this moment.
    lastPresenceAt = Date.now();
    lastSyncErrorSignature = "";
    return { exported: total };
  }

  if (status === 401) {
    logSyncError("ERROR", "Server rejected the kiosk API key", {
      status,
    });
    throw new SyncError(
      "The kiosk API key was rejected by the server. Re-activate this kiosk with a fresh code.",
      "invalid_key",
      true,
    );
  }
  if (status === 422) {
    const reason = typeof data?.error === "string" ? data.error : "invalid_payload";
    // Server error strings are normally reason codes, but never trust a remote
    // value to be PHI-free. Only persist short, code-like reasons.
    const safeReason = /^[a-z0-9_.:-]{1,80}$/i.test(reason)
      ? reason
      : "unknown";
    logSyncError("ERROR", "Server rejected the sync payload", {
      status,
      reason: safeReason,
    });
    throw new SyncError(
      `The server rejected the payload (${reason}). Records will stay pending.`,
      reason,
      true,
    );
  }
  logSyncError("WARNING", "Sync failed; records remain pending", {
    status,
    records: total,
  });
  throw new SyncError(`Sync failed (HTTP ${status}). Will retry later.`, "http_error");
}

export interface HeartbeatResult {
  kioskId: string | null;
  receivedAt: string | null;
  nextHeartbeatInSeconds: number | null;
}

// Presence ping. The portal records last_heartbeat_at and reports the kiosk as
// online; if no heartbeat arrives for 5 minutes it is reported as offline.
//   POST {portal}/api/v1/sync/kiosk/heartbeat
//   header: X-RiseCare-Kiosk-Key: <per-kiosk-secret>
//   body: { kioskId, deviceUid } (identity fields, used for validation)
// A successful record sync also refreshes presence, so callers can skip this
// when syncPending() has just succeeded.
export async function sendHeartbeat(): Promise<HeartbeatResult> {
  const device = await ensureDeviceIdentity();
  if (!device.api_key) {
    throw new SyncError("This kiosk is not activated yet", "not_activated", true);
  }

  const portalBase = await getPortalBaseUrl();
  const heartbeatUrl = `${portalBase.replace(/\/$/, "")}/api/v1/sync/kiosk/heartbeat`;

  const body: Record<string, string> = { deviceUid: device.device_uid };
  // Only echo the kioskId when activation completed locally; sending a missing
  // or stale ID would be rejected as a mismatch (422).
  if (device.kiosk_id) body.kioskId = String(device.kiosk_id);

  syncDebug("Sending heartbeat", { method: "POST", url: heartbeatUrl });

  const { status, data } = await postJsonWithBackoff(
    heartbeatUrl,
    body,
    {
      "X-RiseCare-Kiosk-Key": device.api_key,
    },
    { attempts: 3, baseDelayMs: 2000, timeoutMs: 10000 },
  );

  if (status === 200) {
    lastPresenceAt = Date.now();
    syncDebug("Heartbeat acknowledged", { status });
    return {
      kioskId:
        typeof data?.kioskId === "string" ? data.kioskId : device.kiosk_id || null,
      receivedAt: typeof data?.receivedAt === "string" ? data.receivedAt : null,
      nextHeartbeatInSeconds:
        typeof data?.nextHeartbeatInSeconds === "number"
          ? data.nextHeartbeatInSeconds
          : null,
    };
  }

  if (status === 401) {
    logSyncError("ERROR", "Server rejected the kiosk API key during heartbeat", {
      status,
    });
    throw new SyncError(
      "The kiosk API key was rejected by the server. Re-activate this kiosk with a fresh code.",
      "invalid_key",
      true,
    );
  }
  if (status === 422) {
    logSyncError("ERROR", "Server rejected the heartbeat identity", { status });
    throw new SyncError(
      "The server rejected the heartbeat identity. Re-activate this kiosk with a fresh code.",
      "invalid_identity",
      true,
    );
  }
  logSyncError("WARNING", "Heartbeat failed; kiosk may be reported offline", {
    status,
  });
  throw new SyncError(`Heartbeat failed (HTTP ${status}).`, "http_error");
}

let heartbeatRunning = false;

// Background presence loop: pings the portal every 5 minutes while the kiosk
// is running and activated. Skipped when a recent sync or heartbeat already
// refreshed presence. Failures are silent and retried on the next tick.
export function startHeartbeatLoop(): void {
  const configured = Number(
    process.env.HEARTBEAT_INTERVAL_MS ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const intervalMs = Math.max(
    60_000,
    Number.isFinite(configured) ? configured : DEFAULT_HEARTBEAT_INTERVAL_MS,
  );

  const tick = async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      const device = await getDeviceInfo();
      if (!device.activated) return;
      // A successful sync also refreshes presence, so don't ping redundantly.
      if (lastPresenceAt && Date.now() - lastPresenceAt < intervalMs) return;
      await sendHeartbeat();
    } catch (error) {
      // Expected SyncError failures are already logged (throttled). Unexpected
      // failures are logged here so they are visible in Settings.
      if (!(error instanceof SyncError)) {
        logSyncError("WARNING", "Heartbeat failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      heartbeatRunning = false;
    }
  };

  // Mark presence immediately on boot, then keep the 5-minute cadence.
  void tick();
  setInterval(tick, intervalMs);
}

let syncing = false;

// Background loop: automatically syncs pending records whenever the kiosk is
// activated and has a server link. Failures are silent and non-fatal.
export function startSyncLoop(): void {
  const intervalMs = Math.max(
    5000,
    Number(process.env.SYNC_INTERVAL_MS ?? 30000),
  );
  setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const device = await getDeviceInfo();
      if (device.activated) {
        await syncPending();
      }
    } catch (error) {
      // Background sync errors are retried on the next tick. Unexpected
      // failures are logged (throttled) so they are visible in Settings.
      if (!(error instanceof SyncError)) {
        logSyncError("WARNING", "Background sync failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      syncing = false;
    }
  }, intervalMs);
}
