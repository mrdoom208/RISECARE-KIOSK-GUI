import crypto from "crypto";
import { query, run } from "@workspace/db";
import { postJsonWithBackoff } from "./retry";

// Debug hook for the kiosk's outbound sync. Set SYNC_DEBUG=1 to dump the exact
// payload sent to the portal and the raw response. Includes patient-identifiable
// data, so only enable it while debugging.
function syncDebug(...args: unknown[]): void {
  if (process.env.SYNC_DEBUG === "1") {
    console.log("[sync-debug]", ...args);
  }
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
    "SELECT sync_status, COUNT(*) AS count FROM sessions GROUP BY sync_status",
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

  const sessions: PendingRecord[] = await query(`
    SELECT id, source_session_id AS sourceSessionId, token,
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
    FROM sessions WHERE sync_status = 'pending' ORDER BY started_at ASC
  `);

  const vitals: PendingRecord[] = await query(`
    SELECT vr.id, vr.source_vital_id AS sourceVitalId,
      s.source_session_id AS sourceSessionId,
      vr.blood_pressure_systolic AS bloodPressureSystolic,
      vr.blood_pressure_diastolic AS bloodPressureDiastolic,
      vr.heart_rate AS heartRate, vr.oxygen_saturation AS oxygenSaturation,
      vr.temperature, vr.weight, vr.height, vr.bmi, vr.notes,
      strftime('%Y-%m-%dT%H:%M:%fZ', vr.recorded_at) AS recordedAt
    FROM vital_readings vr
    JOIN sessions s ON s.id = vr.session_id
    WHERE vr.sync_status = 'pending' ORDER BY vr.recorded_at ASC
  `);

  const total = sessions.length + vitals.length;
  if (total === 0) {
    // Nothing to send; drop any stale in-flight batch marker.
    await run("DELETE FROM settings WHERE key = 'sync_payload_id'");
    return { exported: 0 };
  }

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

  await run("UPDATE sessions SET payload_id = ? WHERE sync_status = 'pending'", [payloadId]);
  await run("UPDATE vital_readings SET payload_id = ? WHERE sync_status = 'pending'", [
    payloadId,
  ]);

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
  syncDebug("POST", syncUrl);
  syncDebug("headers", {
    "X-RiseCare-Kiosk-Key": device.api_key
      ? `rk_live… (${device.api_key.length} chars)`
      : "none",
    "Idempotency-Key": payloadId,
  });
  syncDebug("payload", JSON.stringify(payload, null, 2));

  const { status, data } = await postJsonWithBackoff(syncUrl, payload, {
    "X-RiseCare-Kiosk-Key": device.api_key,
    "Idempotency-Key": payloadId,
  }, { attempts: 5 });

  if (status !== 200) {
    syncDebug("response", status, JSON.stringify(data ?? {}, null, 2));
  }

  if (status === 200) {
    await run("UPDATE sessions SET sync_status = 'synced' WHERE payload_id = ?", [payloadId]);
    await run("UPDATE vital_readings SET sync_status = 'synced' WHERE payload_id = ?", [
      payloadId,
    ]);
    await run("DELETE FROM settings WHERE key = 'sync_payload_id'");
    return { exported: total };
  }

  if (status === 401) {
    throw new SyncError(
      "The kiosk API key was rejected by the server. Re-activate this kiosk with a fresh code.",
      "invalid_key",
      true,
    );
  }
  if (status === 422) {
    const reason = typeof data?.error === "string" ? data.error : "invalid_payload";
    throw new SyncError(
      `The server rejected the payload (${reason}). Records will stay pending.`,
      reason,
      true,
    );
  }
  throw new SyncError(`Sync failed (HTTP ${status}). Will retry later.`, "http_error");
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
    } catch {
      // Background sync errors are retried on the next tick.
    } finally {
      syncing = false;
    }
  }, intervalMs);
}
