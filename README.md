# RiseCare Health Kiosk

A modern, self-service health monitoring kiosk application that enables patients to register, record vital signs, and receive automated health recommendations. Designed for healthcare facilities, clinics, and public health stations.

![RiseCare Health Kiosk](https://img.shields.io/badge/Status-Production-blue) ![React](https://img.shields.io/badge/React-19.1.0-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-3178C6)

---

## Features

- **Patient Registration** - Quick patient onboarding with validation (name, phone, age, gender)
- **Vital Signs Recording** - Blood pressure, heart rate, SpO2, temperature, glucose, weight, height, BMI
- **IoT Sensor Integration** - Optional MQTT-based real-time sensor data communication
- **Health Status Evaluation** - Automated normal/warning/critical status for all vitals
- **Session Management** - Track and review patient sessions with full history
- **AI Health Recommendations** - Automated health insights based on recorded vitals
- **Kiosk Mode** - Touchscreen-optimized UI with auto-reset after session completion
- **Print Reports** - Generate and print patient health reports

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
│   │       ├── routes/      # API endpoints (sessions, vitals, sensors)
│   │       ├── mqtt.ts     # MQTT client
│   │       └── app.ts      # Express app config
│   └── risecare-kiosk/     # React frontend kiosk UI
│       ├── public/         # Static assets, images, instructions
│       └── src/
│           ├── components/ # UI components (50+ Radix components)
│           ├── pages/      # Home, Register, Dashboard, Results, History
│           ├── lib/        # Utilities and health evaluation logic
│           └── hooks/      # Custom React hooks
├── lib/
│   ├── api-spec/           # OpenAPI specification
│   ├── api-zod/            # Shared Zod schemas
│   ├── api-client-react/   # Generated React Query API client
│   └── db/                 # SQLite database layer
├── scripts/                # Utility scripts
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
```

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
| `/api/vitals`            | POST   | Record vital signs         |
| `/api/vitals/:sessionId` | GET    | Get vitals for session     |
| `/api/sensors`           | GET    | List available sensors     |

Full API documentation available in [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml)

---

## Vital Signs Evaluation

Health status is automatically evaluated based on standard medical guidelines:

| Vital Sign     | Normal         | Warning          | Critical      |
| -------------- | -------------- | ---------------- | ------------- |
| Blood Pressure | <120/<80 mmHg  | 120-129/<80      | ≥130 or ≥80   |
| Heart Rate     | 60-100 bpm     | 50-59 or 101-110 | <50 or >110   |
| SpO2           | ≥95%           | 90-94%           | <90%          |
| Temperature    | 36.1-37.2°C    | Boundaries       | Outside range |
| Blood Glucose  | 3.9-7.8 mmol/L | Near boundaries  | Outside range |
| BMI            | 18.5-24.9      | <18.5 or 25-29.9 | ≥30           |

---

## Database

Uses SQLite (file-based, no external server required):

- **Location**: `./risecare.sqlite` (configurable via `DATABASE_URL`)
- **Tables**: `sessions`, `vital_readings`, `sensors`
- Tables are created automatically on first run

---

## MQTT Sensor Integration (Optional)

To enable real-time IoT sensor data:

1. Install an MQTT broker (e.g., [Mosquitto](https://mosquitto.org/))
2. Start the broker on default port 1883
3. Configure sensors to publish to `risecare/sensors/#` topic
4. The system works without MQTT using manual input

---

## Scripts

| Script             | Description                   |
| ------------------ | ----------------------------- |
| `pnpm dev`         | Start development environment |
| `pnpm dev:api`     | Start API server only         |
| `pnpm build:kiosk` | Build frontend for production |
| `pnpm typecheck`   | Run TypeScript type checking  |
| `pnpm run db:push` | Push database schema changes  |

---

## Support

For issues and questions, please open an issue in the repository.
