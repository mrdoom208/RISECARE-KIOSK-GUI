# RiseCare Health Kiosk

A modern, self-service health monitoring kiosk application that enables patients to register, record vital signs, and receive automated health recommendations. Designed for healthcare facilities, clinics, and public health stations.

![RiseCare Health Kiosk](https://img.shields.io/badge/Status-Production-blue) ![React](https://img.shields.io/badge/React-19.1.0-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6)

---

## Features

- **Patient Registration** - Quick patient onboarding with live field validation (name ≥ 2 characters, Philippine mobile number starting with `9` and 10 digits, age 1-120, required gender)
- **Terms Agreement** - Patients must accept a terms/consent dialog before registering
- **Vital Signs Recording** - Blood pressure, heart rate, SpO2, temperature, weight, height, BMI
- **IoT Sensor Integration** - Optional MQTT-based real-time sensor data communication
- **Health Status Evaluation** - Automated normal/warning/critical status for all vitals
- **Session Management** - Track and review patient sessions with full history
- **Find My Session** - Patients can look up past sessions and results by phone number or reference code, with rate limiting
- **AI Health Recommendations** - Automated health insights based on recorded vitals (toggleable)
- **Kiosk Mode** - Touchscreen-optimized UI with auto-reset after session completion
- **Configurable Idle Timeout** - Returns to the home screen after a period of inactivity; duration is set by admins in Settings (30s to 10 min)
- **Orientation-Responsive Layout** - UI adapts smoothly between wide/landscape and portrait kiosk displays, with side-aligned scrollbars
- **Admin Security** - Username/password-protected history and admin accounts management (create admins & sub admins)
- **Print Reports** - Generate and print patient health reports
- **Power Controls** - Admin Power menu with Shutdown, Restart, and Lock options (sent to the Raspberry Pi via MQTT)
- **WiFi Management** - Admin network page to check status, scan and connect to WiFi networks on the Raspberry Pi

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
- **SQLite** (sql.js) - Portable database
- **MQTT** - IoT sensor communication
- **Zod** - Request validation
- **CORS** enabled

### Development

- **pnpm workspaces** - Monorepo architecture
- **OpenAPI 3.1** - API specification
- **Orval** - TypeScript client generation
- **TypeScript 5.9** across all packages

---

## Project Structure

```
RiseCare-Health-Kiosk/
├── artifacts/
│   ├── api-server/          # Express backend API
│   │   └── src/
│   │       ├── routes/      # API endpoints (sessions, vitals, sensors, settings, network, print, ai)
│   │       ├── mqtt.ts     # MQTT client
│   │       └── app.ts      # Express app config
│   └── risecare-kiosk/     # React frontend kiosk UI
│       ├── public/         # Static assets, images, instructions
│       └── src/
│           ├── components/ # UI components (50+ Radix components)
│           ├── pages/      # Home, Register, Dashboard, Results, History, FindSession
│           ├── lib/        # Utilities and health evaluation logic
│           └── hooks/      # Custom React hooks
├── hardware/               # Raspberry Pi scripts (sensor read, shutdown)
├── lib/
│   ├── api-spec/           # OpenAPI specification
│   ├── api-zod/            # Shared Zod schemas
│   ├── api-client-react/   # Generated React Query API client
│   └── db/                 # SQLite database layer
├── scripts/                # Utility scripts
├── graphify-out/           # Knowledge graph output (auto-generated)
├── .env                    # Environment configuration
├── package.json            # Root workspace config
└── tsconfig.json           # TypeScript base config
```

---

## Prerequisites

- **Node.js** (LTS version recommended)
- **pnpm** (`npm install -g pnpm`)

---

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd RiseCare-Health-Kiosk

# Install all dependencies (monorepo)
pnpm install
```

---

## Environment Configuration

Create or edit `.env` in the project root:

```env
DATABASE_URL=./risecare.sqlite
PORT=5000
BASE_PATH=/
MQTT_BROKER=mqtt://localhost:1883
MQTT_TOPIC=risecare/sensors/#
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:0.5b
SESSION_SECRET=change-me-to-a-long-random-string
```

- `OLLAMA_HOST` / `OLLAMA_MODEL` - configure the local Ollama server used for AI health recommendations
- `SESSION_SECRET` - secret used to sign admin session tokens
- `RISECARE_PORTAL_URL` - optional base URL of the RiseCare Admin Portal used for kiosk activation and sync. Defaults to `http://localhost:3001` in dev and `https://portal.example.com` in production; the `server_link` setting overrides the default when both are set, and this env var takes precedence over the setting.

To disable MQTT (manual input mode):

```env
NO_MQTT=1
```

---

## Running the Application

### Development Mode

```bash
# Run both API server and kiosk frontend concurrently
pnpm dev

# Or run individually:
pnpm run dev:api      # API server only (port 5000)
pnpm run dev:local    # Both with local proxy
```

**Access Points:**

- Kiosk Frontend: http://localhost:5173
- API Server: http://localhost:5000

### Production Build

```bash
# Build the kiosk frontend
pnpm run build:kiosk

# The API server can serve the built frontend in production:
# Set NODE_ENV=production or SERVE_STATIC=true
pnpm run start
```

---

## API Endpoints

| Endpoint                 | Method | Description                |
| ------------------------ | ------ | -------------------------- |
| `/health`                | GET    | Health check               |
| `/api/sessions`          | POST   | Create new patient session |
| `/api/sessions/token`    | POST   | Validate session token     |
| `/api/sessions/:id`      | GET    | Get session details        |
| `/api/sessions`          | GET    | List all sessions          |
| `/api/sessions/find`     | POST   | Find sessions by phone number or reference code (rate-limited) |
| `/api/sessions/:id/vitals` | POST | Save or update vitals for a session |
| `/api/sessions/:id/vitals/clear` | POST | Clear individual vital fields for a session |
| `/api/vitals`            | POST   | Record vital signs         |
| `/api/vitals/:sessionId` | GET    | Get vitals for session     |
| `/api/sensors`           | GET    | List available sensors     |
| `/api/settings/register` | POST   | Create superadmin/admin account (username + password) |
| `/api/settings/login`    | POST   | Login with username + password            |
| `/api/settings/accounts` | GET    | List accounts (superadmin only, optional `?role=` filter) |
| `/api/settings/accounts/:id` | PUT/DELETE | Edit / remove an account (superadmin only) |
| `/api/settings/logs`     | GET    | Get activity logs (superadmin only)       |
| `/api/settings/recommendation` | GET/POST | Get / toggle AI recommendations |
| `/api/settings/idle-timeout` | GET/POST | Get / set idle timeout (seconds) |
| `/api/settings/export`   | POST   | Export database            |
| `/api/settings/import`   | POST   | Import database            |
| `/api/settings/shutdown` | POST   | Send MQTT shutdown command (legacy alias) |
| `/api/settings/power`    | POST   | Send MQTT power command (shutdown / restart / lock) |
| `/api/print/receipt`     | POST   | Send report to thermal printer |
| `/api/print/test`        | POST   | Send a test page to the printer |
| `/api/ai/recommendation` | POST   | AI health assessment       |
| `/api/network/status`    | GET    | Get network connection status |
| `/api/network/wifi/scan` | GET    | Scan for available WiFi networks |
| `/api/network/wifi/connect` | POST | Connect to a WiFi network |
| `/api/network/wifi/disconnect` | POST | Disconnect from the current network |

Full API documentation available in [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml)

---

## Patient Registration Validation

All registration fields are validated live as the patient types:

| Field        | Rule                                                              |
| ------------ | ----------------------------------------------------------------- |
| Full Name    | Required, at least 2 characters (digits stripped on input)        |
| Phone Number | Required, `+63` prefix, must start with `9`, exactly 10 digits (red border marks invalid input) |
| Age          | Required, numeric, between 1 and 120                              |
| Sex          | Required (Male / Female)                                          |

The **Begin Session** button stays disabled until every field is valid.

---

## Orientation-Responsive Layout

The kiosk UI adapts to both portrait and widescreen (landscape) displays:

- A fluid root font size (`clamp` + `vmin`) scales the entire interface to the screen
- Wide screens use wider content containers and multi-column layouts; portrait keeps a compact single-column flow (Tailwind `portrait:` variants)
- Scrollable pages (e.g. Results, History) align their scrollbars to the screen edge while content stays centered

---

## Vital Signs Evaluation

Health status is automatically evaluated based on standard medical guidelines:

| Vital Sign     | Normal         | Warning          | Critical      |
| -------------- | -------------- | ---------------- | ------------- |
| Blood Pressure | <120/<80 mmHg  | 120-129/<80      | ≥130 or ≥80   |
| Heart Rate     | 60-100 bpm     | 50-59 or 101-110 | <50 or >110   |
| SpO2           | ≥95%           | 90-94%           | <90%          |
| Temperature    | 36.1-37.2°C    | Boundaries       | Outside range |
| BMI            | 18.5-24.9      | <18.5 or 25-29.9 | ≥30           |

---

## Database

Uses SQLite (file-based, no external server required):

- **Location**: `./risecare.sqlite` (configurable via `DATABASE_URL`)
- **Tables**: `sessions`, `vital_readings`, `sensors`, `accounts` (admin accounts), `activity_log`, `settings`
- Tables are created automatically on first run

---

## MQTT Sensor Integration (Optional)

To enable real-time IoT sensor data:

1. Install an MQTT broker (e.g., [Mosquitto](https://mosquitto.org/))
2. Start the broker on default port 1883
3. Configure sensors to publish to `risecare/sensors/#` topic
4. The system works without MQTT using manual input

**Command topics**: the API server publishes to `risecare/command/shutdown`, `risecare/command/restart`, and `risecare/command/lock` to remotely control the Raspberry Pi (see `hardware/shutdown.py`).

---

## Admin & Security

- **Username & password login**: Session history and admin actions are locked behind an admin login (username + password)
- **Account roles**: Accounts are either **Super Admin** (full access) or **Admin**. Only super admins see the Activity Log and Accounts categories (which list all accounts with role badges, edit accounts, remove accounts, and can create both super admins and admins); admins get the remaining settings (Sensors, Database, Print Test, AI Integration, Idle Timeout, Power) only
- **Activity logging**: Admin actions (e.g. system shutdown, database operations) are recorded in the `activity_log` table

---

## Scripts

| Script             | Description                   |
| ------------------ | ----------------------------- |
| `pnpm dev`         | Start development environment |
| `pnpm dev:api`     | Start API server only         |
| `pnpm dev:local`   | Start API + kiosk with local proxy |
| `pnpm build:kiosk` | Build frontend for production |
| `pnpm typecheck`   | Run TypeScript type checking  |
| `pnpm run db:push` | Push database schema changes  |
| `pnpm run db:migrate` | Apply database migrations   |
| `pnpm run db:studio` | Open the database studio    |

---

## Support

For issues and questions, please open an issue in the repository.
