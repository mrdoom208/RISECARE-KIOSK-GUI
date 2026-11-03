# RiseCare Health Kiosk

A modern, self-service health monitoring kiosk application that enables patients to register, record vital signs, and receive automated health recommendations. Designed for healthcare facilities, clinics, and public health stations.

![RiseCare Health Kiosk](https://img.shields.io/badge/Status-Production-blue) ![React](https://img.shields.io/badge/React-19.1.0-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6)

---

## Features

- **Patient Registration** - Quick patient onboarding with live field validation (name ≥ 2 characters, Philippine mobile number starting with `9` and 10 digits, age 1-120, required gender)
- **Terms Agreement** - Patients must accept a terms/consent dialog before registering; tapping the terms text also toggles the checkbox
- **Vital Signs Recording** - Blood pressure, heart rate, SpO2, temperature, weight, height, BMI
- **IoT Sensor Integration** - Optional MQTT-based real-time sensor data communication, with live readings pushed to the kiosk over WebSocket
- **Health Status Evaluation** - Automated normal/warning/critical status for all vitals
- **Session Management** - Track and review patient sessions with full history
- **Find My Session** - Patients can look up past sessions and results by phone number or reference code, with rate limiting
- **Kiosk Mode** - Touchscreen-optimized UI with auto-reset after session completion
- **Configurable Idle Timeout** - Returns to the home screen after a period of inactivity; duration is set by admins in Settings (30s to 1 hour)
- **Orientation-Responsive Layout** - UI adapts smoothly between wide/landscape and portrait kiosk displays, with side-aligned scrollbars
- **Admin Security** - Username/password-protected settings, history, and account management (super admins and admins), with rate-limited login and re-authentication for destructive actions
- **Print Reports** - Generate and print patient health reports
- **Power Controls** - Admin Power menu with Shutdown, Restart, and Lock (sent to the Raspberry Pi via MQTT), plus Exit Program to close the local Chromium kiosk and return to the Linux desktop
- **WiFi Management** - Admin network page to check status, scan and connect to WiFi networks on the Raspberry Pi
- **Server Status** - Live backend, API, database, MQTT, portal, and device activation health
- **System Information** - Service version/commit, Node and OS details, uptime, memory, and storage usage
- **System Logs** - Searchable, filterable, paginated operational logs with date ranges, expandable details, and plain-text export (super admin only)
- **Check for Updates** - Shows the installed commit and any newer commit on `origin/main`, then applies updates with re-authentication and reboots the kiosk

---

## Tech Stack

### Frontend (Kiosk UI)

- **React 19** with TypeScript
- **Vite** - Build tool and dev server
- **Tailwind CSS 4** - Utility-first styling
- **Radix UI** - Accessible component library
- **TanStack React Query** - Server state management
- **Recharts** - Data visualization
- **Framer Motion** - Animations
- **React Hook Form + Zod** - Form handling and validation

### Backend (API Server)

- **Node.js** with Express 5
- **SQLite** (sql.js) - Portable, file-based database
- **MQTT** - IoT sensor communication
- **WebSocket** (`ws`) - Live sensor/calibration push to the kiosk
- **Zod** - Request validation
- **bcrypt** - Password hashing
- **CORS** enabled

### Development

- **pnpm workspaces** - Monorepo architecture
- **OpenAPI 3.1** - API specification
- **Orval** - TypeScript client generation
- **TypeScript 5.9** across all packages

---

## Project Structure

```
RISECARE-KIOSK-GUI/
├── artifacts/
│   ├── api-server/          # Express backend API
│   │   └── src/
│   │       ├── routes/      # sessions, vitals, sensors, settings, system, print, network, device
│   │       ├── mqtt.ts      # MQTT client and throttled logging
│   │       ├── system-log.ts# Bounded, PHI-redacted system log writer
│   │       ├── ws.ts        # WebSocket bridge (/ws)
│   │       └── app.ts       # Express app config
│   └── risecare-kiosk/      # React frontend kiosk UI
│       ├── public/          # Static assets, images, instructions
│       └── src/
│           ├── components/  # UI and Settings components
│           ├── pages/       # Home, Register, Dashboard, Results, History, FindSession
│           ├── lib/         # Utilities and health evaluation logic
│           └── hooks/       # Custom React hooks
├── hardware/                # Raspberry Pi scripts (sensors, printer, MQTT, power, WiFi)
├── lib/
│   ├── api-spec/            # OpenAPI specification
│   ├── api-zod/             # Shared Zod schemas
│   ├── api-client-react/    # Generated React Query API client
│   └── db/                  # SQLite database layer and schema
├── deploy/                  # Deployment configuration (Mosquitto)
├── .env                     # Environment configuration (gitignored)
├── PINS.txt                 # Raspberry Pi pin/interface inventory
├── package.json             # Root workspace config
└── tsconfig.json            # TypeScript base config
```

---

## Prerequisites

- **Node.js** (LTS version recommended)
- **pnpm** (`npm install -g pnpm`)
- **Raspberry Pi OS** with Python 3 for the hardware bridge (production kiosk only)
- An MQTT broker such as [Mosquitto](https://mosquitto.org/) (optional, but required for live sensors)

---

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd RISECARE-KIOSK-GUI

# Install all dependencies (monorepo)
pnpm install
```

---

## Environment Configuration

Create or edit `.env` in the project root. `DATABASE_URL` is required — the database
layer reads it directly, and the API will not start without it.

```env
# Required
DATABASE_URL=./risecare.sqlite
PORT=5000
SESSION_SECRET=change-me-to-a-long-random-string

# Network / MQTT
HOST=127.0.0.1
MQTT_BROKER=mqtt://localhost:1883
MQTT_TOPIC=risecare/sensors/#

# Optional
# NO_MQTT=1
# RISECARE_PORTAL_URL=http://localhost:3001

# System logs (Settings > System Logs)
SYSTEM_LOG_RETENTION_DAYS=14
SYSTEM_LOG_MAX_ENTRIES=2000
SYSTEM_LOG_DEBUG=0

# Debug / console output
SENSOR_DEBUG=0
# MQTT_DEBUG=1
# API_SILENT=1
```

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `./risecare.sqlite` (must be present in `.env`) | SQLite database file, relative to the workspace root |
| `PORT` | `5000` (required) | API server port |
| `HOST` | `127.0.0.1` | API bind address; use `0.0.0.0` only when a container/proxy needs it |
| `BASE_PATH` | `/` | Frontend base path used by the Vite build |
| `API_PORT` | `5000` | API port used by the Vite dev proxy |
| `SESSION_SECRET` | random on each boot | Signs admin session cookies; set a long random value for persistent sessions |
| `COOKIE_SECURE` | unset | Set to `true` when serving over HTTPS |
| `NODE_ENV` | `development` | `production` serves the built kiosk through the API server |
| `SERVE_STATIC` | unset | Set to `true` to serve the built frontend without setting `NODE_ENV=production` |
| `APP_VERSION` | `package.json` version | Overrides the version shown in Server Status / System Information |
| `MQTT_BROKER` | `mqtt://localhost:1883` | MQTT broker URL |
| `MQTT_TOPIC` | `risecare/sensors/#` | MQTT subscription topic |
| `NO_MQTT` | unset | Set to `1` to disable MQTT and use manual sensor input |
| `RISECARE_PORTAL_URL` | dev `http://localhost:3001`, prod `https://portal.example.com` | Portal URL for activation and sync. Precedence: this env var → `server_link` setting → environment default |
| `SYSTEM_LOG_RETENTION_DAYS` | `14` | Days before system logs are pruned; clamped to `7–30` |
| `SYSTEM_LOG_MAX_ENTRIES` | `2000` | Maximum stored system-log rows; clamped to `500–10000` |
| `SYSTEM_LOG_DEBUG` | unset | Set to `1` to record DEBUG-level system logs (API requests and MQTT retry details) |
| `SENSOR_DEBUG` | unset | Set to `1` to print per-reading, calibration, and availability output |
| `MQTT_DEBUG` | unset | Set to `1` to print every raw MQTT receive/publish payload |
| `API_SILENT` | unset | Set to `1` to suppress `console.log`; warnings/errors still print |
| `SYNC_DEBUG` | unset | Set to `1` to dump outbound sync payloads |
| `SYNC_INTERVAL_MS` | `30000` | Background offline-sync interval |

> Debug flags can expose measurement data in the console. Leave them off on a
> production kiosk and enable them only while troubleshooting.

---

## Running the Application

### Development Mode

```bash
# Run both API server and kiosk frontend concurrently
pnpm dev

# Or run individually:
pnpm run dev:api      # API server only (port 5000)
pnpm run dev:local    # Both with local proxy

# Quiet API console output (warnings/errors remain visible)
pnpm --filter @workspace/api-server run dev:silent
```

On the Raspberry Pi, install the hardware Python dependencies and run the
hardware service without routine stdout logs (errors on stderr remain visible):

```bash
python3 -m pip install -r requirements.txt
python3 hardware/main.py --silent
```

**Access Points:**

- Kiosk Frontend: http://localhost:3000 (Vite dev server; override with `PORT`)
- API Server: http://localhost:5000
- WebSocket: ws://localhost:5000/ws

### Production / Quiet Mode

```bash
# Quiet development servers (API_SILENT=1)
pnpm prod

# Build the kiosk frontend, then serve it from the API server
pnpm run build:kiosk
pnpm run start
```

`pnpm run start` builds the kiosk and starts the API with `NODE_ENV=production`,
so the built frontend is served from the same port as the API (default
http://localhost:5000).

---

## API Endpoints

All API routes are mounted under `/api`. `Auth` means an admin session is required;
`Super admin` and `Re-auth` are additional restrictions.

### Health, Sessions & Vitals

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/healthz` | GET | Public | Health check |
| `/api/sessions` | GET | Auth | List all sessions |
| `/api/sessions` | POST | Public | Create a new patient session |
| `/api/sessions/find` | POST | Public | Find sessions by phone number or reference code (rate-limited) |
| `/api/sessions/token` | POST | Public | Validate a session token |
| `/api/sessions/:id` | GET | Public | Get session details |
| `/api/sessions/:id/vitals` | POST | Public | Save or update vitals for a session |
| `/api/sessions/:id/vitals/clear` | POST | Public | Clear individual vital fields for a session |
| `/api/vitals/latest` | GET | Public | Get the latest live vital readings |

### Sensors & Printing

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/sensors/settings` | GET/PUT | Public | Read or save enabled sensors (PUT also syncs them over MQTT) |
| `/api/sensors/status` | GET | Public | MQTT connection, latest availability snapshot, and staleness |
| `/api/sensors/refresh` | POST | Public | Ask the hardware process to re-probe sensors |
| `/api/sensors/trigger` | POST | Public | Trigger a single sensor measurement |
| `/api/sensors/command` | POST | Public | Send a command to a sensor |
| `/api/sensors/test-all` | POST | Public | Test enabled sensors sequentially |
| `/api/sensors/test-all-results` | GET | Public | Get the latest test-all results |
| `/api/sensors/latest-readings` | GET | Public | Get the latest in-memory reading per sensor |
| `/api/sensors/test-results` | GET | Public | Get per-sensor test results |
| `/api/sensors/calibration` | GET | Public | Get calibration results |
| `/api/sensors/calibration-progress` | GET | Public | Get calibration progress |
| `/api/sensors/calibration/reset` | POST | Public | Reset stored calibration values |
| `/api/print/test` | POST | Public | Print a test page |
| `/api/print/receipt` | POST | Public | Print a patient health report |

### Settings & Accounts

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/settings/register` | POST | Auth + Super admin | Create a super admin or admin account |
| `/api/settings/login` | POST | Public | Login with username + password (rate-limited) |
| `/api/settings/logout` | POST | Public | Destroy the current session |
| `/api/settings/me` | GET | Auth | Current account details |
| `/api/settings/accounts` | GET | Auth + Super admin | List accounts, optionally filtered by `?role=` |
| `/api/settings/accounts/:id` | PUT/DELETE | Auth + Super admin | Edit or remove an account |
| `/api/settings/reauthenticate` | POST | Auth | Verify the password again for destructive actions |
| `/api/settings/logs` | GET | Auth + Super admin | Get the activity log (last 100 entries) |
| `/api/settings/export` | GET | Auth + Super admin + Re-auth | Download the SQLite database |
| `/api/settings/import` | POST | Auth + Super admin + Re-auth | Import a database |
| `/api/settings/delete` | POST | Auth + Super admin + Re-auth | Delete all session and vital data |
| `/api/settings/export-server` | POST | Auth + Re-auth | Export pending records to the portal |
| `/api/settings/idle-timeout` | GET/POST | Public / Auth | Get or set the idle timeout (30–3600 seconds) |
| `/api/settings/network-enabled` | GET/POST | Public / Auth | Get or set whether network features are enabled |
| `/api/settings/server-connection` | GET | Auth | Check connectivity to the configured portal |
| `/api/settings/power` | POST | Auth + Re-auth | Send shutdown / restart / lock / exit-kiosk |
| `/api/settings/shutdown` | POST | Auth + Re-auth | Legacy shutdown alias |

### Updates

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/settings/update/info` | GET | Auth + Super admin | Installed commit (hash, subject, date, author) |
| `/api/settings/update/check` | GET | Auth + Super admin | Fetch `origin/main` and compare local/remote commits |
| `/api/settings/update/apply` | POST | Auth + Super admin + Re-auth | Reset to `origin/main` and reboot the Raspberry Pi |

### System Monitoring

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/system/status` | GET | Auth | Backend, API, database, MQTT, portal, and device status |
| `/api/system/info` | GET | Auth | Version/commit, OS, uptime, memory, and storage information |
| `/api/system/logs` | GET | Auth + Super admin | Paginated/filterable system logs |
| `/api/system/logs/export` | GET | Auth + Super admin | Export filtered system logs as a `.txt` file |

### Network & Device

| Endpoint | Method | Access | Description |
| --- | --- | --- | --- |
| `/api/network/status` | GET | Auth | Network connection status |
| `/api/network/lan` | GET | Auth | LAN status |
| `/api/network/wifi/scan` | GET | Auth | Scan for WiFi networks |
| `/api/network/wifi/connect` | POST | Auth | Connect to a WiFi network |
| `/api/network/wifi/disconnect` | POST | Auth | Disconnect from the current network |
| `/api/device/info` | GET | Auth | Device UID, kiosk ID, activation, and sync state |
| `/api/device/activate` | POST | Auth + Super admin + Re-auth | Exchange an activation code for a kiosk ID and API key |
| `/api/device/sync` | POST | Auth + Super admin + Re-auth | Sync pending records to the portal now |

Network routes additionally return `403` when network features are disabled in
Settings. The OpenAPI schema in
[`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml) covers the core
session/vitals endpoints; this README is the authoritative list for the full
API, including Settings, System, Network, and Device routes.

### WebSocket

`ws://<host>:<port>/ws` streams:

- `sensor_reading` - live BP, heart rate/SpO2, temperature, weight, and height
- `sensor_availability` - current sensor/printer availability snapshot
- `calibration_progress` - calibration and sensor-test progress

---

## Settings & Administration

The Settings dialog is available after admin login:

| Screen | Access | Purpose |
| --- | --- | --- |
| Profile | All admins | View the signed-in account |
| Device Information | All admins | Device UID, kiosk identity, activation, sync state |
| Network Settings | All admins | Network status, WiFi scan, LAN status, connect/disconnect |
| Idle Timeout | All admins | Set inactivity timeout (30–3600 seconds) |
| Server Status | All admins | Backend/API/database/MQTT/portal health |
| System Information | All admins | Version, commit, OS, uptime, memory, storage |
| Sensors/Print Test | All admins | Enable sensors, run tests/calibration, print a test page |
| System Logs | Super admin | Search, filter, export operational logs |
| Activity Log | Super admin | Audit trail of admin actions |
| Accounts | Super admin | Create, edit, and remove admins/super admins |
| Check for Updates | Super admin | Compare/apply `origin/main` and reboot |
| Power | All admins | Shutdown, restart, lock, or exit the kiosk |

### Server Status

`GET /api/system/status` checks the local backend and returns:

- Overall `online` / `degraded` status and response time
- Backend version, environment, and uptime
- API, database, and MQTT status
- Portal URL and kiosk activation/sync state

The Settings menu polls this endpoint every 10 seconds while open.

### System Information

`GET /api/system/info` reports service version and commit, Node version,
platform/architecture, hostname, process/system uptime, RSS/heap and system
memory, database size, disk totals/free space, and device identity.

### System Logs

`GET /api/system/logs` supports:

- `level` - `INFO`, `WARNING`, `ERROR`, or `DEBUG`
- `component` - `Backend`, `Database`, `Sensor`, `API`, `Network`, `Sync`, `System`
- `search` - matches message, details, or component
- `from` / `to` - ISO timestamps or `YYYY-MM-DD` dates
- `limit` / `offset` - pagination (UI uses 100 rows per page)

The UI stacks date/time in one column, expands rows to show details, and exports
the current filter as `risecare-system-logs-<timestamp>.txt`. Export is capped
at 5,000 rows.

Logs are stored server-side only:

- Retention defaults to **14 days** and **2,000 rows** (both clamped, see above)
- Pruning runs at boot and every 24 hours
- Sensitive fields (patient names, phone numbers, vitals, credentials, keys) are
  redacted before storage, and messages/details are length-limited
- The React app never collects or uploads logs itself

### Check for Updates

The update dialog:

1. Loads the installed commit from `/api/settings/update/info`
2. Automatically checks `origin/main` when opened with network enabled
3. Shows the installed and available commit subject, short hash, date, and author
4. Requires re-authentication before applying an update
5. Fetches and resets to `origin/main` (falling back to `pull --rebase`), then
   sends a restart command via MQTT (or `sudo reboot` on Linux)

Updates need the kiosk to have network access and a git remote configured.

---

## Logging & Monitoring

The API writes two independent kinds of logs:

1. **System Logs** (`system_logs` table) - bounded, PHI-free, visible in
   Settings > System Logs and controlled by `SYSTEM_LOG_RETENTION_DAYS` and
   `SYSTEM_LOG_MAX_ENTRIES`.
2. **Console output** (`stdout`/`stderr`) - handled by the terminal, systemd,
   or a process manager. This is not bounded by the application.

### Reducing console output

Console writes do not accumulate in Node's heap, but their destination can
grow: terminal scrollback, the systemd journal, and PM2/nohup log files. Frequent
output also adds CPU/I/O overhead on a Raspberry Pi.

Recommended production settings:

- Run the kiosk with `pnpm prod` (sets `API_SILENT=1`) or start the API with
  `API_SILENT=1`
- Run the hardware bridge with `python3 hardware/main.py --silent`
- Leave `MQTT_DEBUG`, `SENSOR_DEBUG`, `SYNC_DEBUG`, and `SYSTEM_LOG_DEBUG` off
  unless actively troubleshooting

### What gets logged automatically

- Backend start/stop and database checks
- MQTT connect/disconnect/recovery
- Sensor availability **transitions only**:
  - One initial baseline summary
  - Detected/unavailable changes per sensor
  - Printer connected/offline/paper-out/low-paper/ready changes
  - One stale warning per availability outage and one recovery entry
- Sensor settings saves, test-all completion, and command failures
- Print test/receipt failures
- Sync exports and failures
- Admin/system actions such as exports, imports, deletes, network toggles,
  updates, and power commands

**Not logged:** every 10-second availability heartbeat, individual vital
readings, calibration progress, and test results. Those are high-frequency
and may contain patient measurements.

While the MQTT broker is unreachable, the API retries indefinitely but logs
failures at most once every 10 minutes; recovery is logged once. Per-retry
detail is available only at DEBUG level.

### Optional debug output

```bash
# Raw MQTT traffic and per-reading/calibration sensor output
MQTT_DEBUG=1 SENSOR_DEBUG=1 pnpm dev:api

# DEBUG-level system logs (API method/path/status/duration and MQTT retries)
SYSTEM_LOG_DEBUG=1 pnpm dev:api
```

### Capping systemd journal storage

```ini
# /etc/systemd/journald.conf.d/risecare.conf
[Journal]
SystemMaxUse=200M
SystemMaxFileSize=20M
MaxRetentionSec=7day
```

```bash
sudo systemctl restart systemd-journald
```

### Capping PM2 logs

If the API runs under PM2, install and configure `pm2-logrotate` rather than
leaving `pm2.log` unbounded:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 5
```

Also limit terminal scrollback if the kiosk runs in a desktop terminal.

---

## Patient Registration Validation

All registration fields are validated live as the patient types:

| Field | Rule |
| --- | --- |
| Full Name | Required, at least 2 characters (digits stripped on input) |
| Phone Number | Required, `+63` prefix, must start with `9`, exactly 10 digits (red border marks invalid input) |
| Age | Required, numeric, between 1 and 120 |
| Sex | Required (Male / Female) |

The **Begin Session** button stays disabled until every field is valid.

---

## Orientation-Responsive Layout

The kiosk UI adapts to both portrait and widescreen (landscape) displays:

- A fluid root font size (`clamp` + `vmin`) scales the entire interface to the screen
- Wide screens use wider content containers and multi-column layouts; portrait keeps a compact single-column flow (Tailwind `portrait:` variants)
- Scrollable pages (e.g. Results, History) align their scrollbars to the screen edge while content stays centered
- Settings screens use a single scroll context so long forms (such as Accounts) remain usable with touch swipes

---

## Vital Signs Evaluation

Health status is automatically evaluated based on standard medical guidelines:

| Vital Sign | Normal | Warning | Critical |
| --- | --- | --- | --- |
| Blood Pressure | <120/<80 mmHg | 120-129/<80 | ≥130 or ≥80 |
| Heart Rate | 60-100 bpm | 50-59 or 101-110 | <50 or >110 |
| SpO2 | ≥95% | 90-94% | <90% |
| Temperature | 36.1-37.2°C | Boundaries | Outside range |
| BMI | 18.5-24.9 | <18.5 or 25-29.9 | ≥30 |

---

## Database

Uses SQLite (file-based, no external server required):

- **Location**: `./risecare.sqlite` (configurable via `DATABASE_URL`)
- **Tables**:
  - `sessions` - patient sessions and offline-sync state
  - `vital_readings` - recorded vitals and offline-sync state
  - `sensors` - sensor instruction content
  - `accounts` - hashed admin/super admin accounts
  - `activity_log` - admin audit trail
  - `settings` - kiosk settings (idle timeout, enabled sensors, network, etc.)
  - `system_logs` - bounded operational logs with level/component/date indexes
  - `device` - permanent device identity, kiosk ID, API key, activation, sync state
- Tables and indexes are created automatically on first run
- Corrupt databases are backed up to `risecare.sqlite.corrupt-<timestamp>.bak` and recreated
- Plaintext legacy passwords are migrated to bcrypt hashes on boot

---

## MQTT Sensor Integration (Optional)

To enable real-time IoT sensor data:

1. Install an MQTT broker (e.g., [Mosquitto](https://mosquitto.org/))
2. Start the broker on the default port `1883`
3. Configure sensors to publish to the `risecare/sensors/#` topic
4. The system works without MQTT using manual input (`NO_MQTT=1`)

**Command topics**: the API server publishes to `risecare/command/shutdown`,
`risecare/command/restart`, and `risecare/command/lock` (plus
`risecare/command/exit-kiosk`) to remotely control the Raspberry Pi (see
`hardware/shutdown.py`). Settings are pushed on `risecare/command/settings`,
and sensor probes can be requested on `risecare/command/status`.

The hardware process publishes availability on `risecare/sensors/availability`
at boot and every 10 seconds. The API marks availability stale after 30 seconds
without a new snapshot, and the kiosk disables affected vitals until it recovers.

### MAX30102 (Pulse Oximeter) Payload

The device publishes on `risecare/sensors/vitals` once per second while a heart rate / SpO₂ measurement is running. The payload always carries the sensor state, so the kiosk can tell "no finger yet" apart from "reading not settled":

| Field | Type | Description |
| --- | --- | --- |
| `sessionId` | number | Session the measurement belongs to |
| `fingerDetected` | boolean | `false` while no finger is on the sensor |
| `hrValid` | boolean | `true` when `bpm` is a measurement the driver accepted |
| `spo2Valid` | boolean | `true` when `spo2` is a measurement the driver accepted |
| `bpm` | number | Pulse rate — only present when `hrValid` is `true` |
| `spo2` | number | SpO₂ in percent — only present when `spo2Valid` is `true` |
| `quality` | number | Signal quality score (0–1) |

The kiosk shows **“Please insert your finger”** while `fingerDetected` is `false`, and only accepts a reading once it is flagged valid and has settled (5 consecutive stable measurements). Invalid readings are never stored in the database.

### VL53L1X (Height) Payload

The device publishes on `risecare/sensors/height` once per second while a height measurement is running. The payload only contains a measurement the sensor could take:

| Field | Type | Description |
| --- | --- | --- |
| `sessionId` | number | Session the measurement belongs to |
| `cm` | number | Height in centimetres — the patient's height |

The height is `sensor-to-floor distance − measured distance`, so the sensor has to be **calibrated** first (nothing under the sensor while it measures). A reading is only published when somebody is standing under the sensor: with an empty space below the sensor the beam reaches the floor and no height is published at all, so the database never receives a `0 cm` measurement. The published value is the median of the recent measurements, which keeps it stable enough for the kiosk to accept it (4 consecutive stable measurements).

**Calibration**: the kiosk sends the `height` command with value `2`; the device reports its progress on `risecare/calibration/progress/height` and the result on `risecare/calibration/height` (`totalHeight` in centimetres). The last progress message is `Height measured: <x> cm`, which is the message the kiosk uses to offer its **“Done — height measured”** button (value `12`).

**Standalone diagnostic** (on the Raspberry Pi, no kiosk needed):

```bash
cd hardware
python3 vl53l1x_test.py             # stream raw distance readings
python3 vl53l1x_test.py --height     # stream the calculated height
python3 vl53l1x_test.py --calibrate  # calibrate the sensor-to-floor distance
```

---

## Admin & Security

- **Username & password login**: Settings, session history, and admin actions are locked behind an admin login; passwords are stored as bcrypt hashes
- **Account roles**: Accounts are either **Super Admin** (full access) or **Admin**. Only super admins see System Logs, Activity Log, Accounts, and Check for Updates; admins get the remaining settings (Profile, Device Information, Network, Idle Timeout, Server Status, System Information, Sensors/Print Test, Power)
- **Re-authentication**: Database export/import/delete, device activation/sync, power commands, server export, and updates require a recent password confirmation before running
- **Rate limiting**: Repeated failed logins are limited to 10 per 15 minutes; sensitive actions are limited to 20 per minute; session lookup has its own limiter
- **Session cookies**: `httpOnly`, `sameSite=lax`, 8-hour lifetime; set `COOKIE_SECURE=true` behind HTTPS
- **Activity logging**: Admin actions (shutdown, database operations, account changes, activation, sync, updates, network toggles) are recorded in `activity_log`
- **System logging**: Operational events are recorded in `system_logs` with automatic PHI redaction and rotation

---

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start API + kiosk development servers |
| `pnpm prod` | Start both with `API_SILENT=1` |
| `pnpm dev:api` | Start API server only |
| `pnpm dev:local` | Start API + kiosk with the local proxy |
| `pnpm build:kiosk` | Build the frontend for production |
| `pnpm start` | Build the kiosk and serve it from the production API |
| `pnpm build` | Type-check and build all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm typecheck:libs` | Type-check shared libraries |
| `pnpm test:api` | Placeholder API test command |
| `pnpm run db:push` | Push database schema changes |
| `pnpm run db:migrate` | Apply database migrations |
| `pnpm run db:studio` | Open the database studio |

---

## Support

For issues and questions, please open an issue in the repository.
