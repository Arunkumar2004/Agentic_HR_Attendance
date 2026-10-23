# Attendly — Agentic HR & Attendance

A full-stack HR and attendance platform with a React dashboard, a TypeScript/Express API, SQLite storage, Excel export, and three built-in "agents" that automate monitoring, notifications, and HR question answering.

![Status](https://img.shields.io/badge/status-active-success)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)
![Agents](https://img.shields.io/badge/agents-monitor%20%7C%20notify%20%7C%20HR-8A2BE2)

---

## Overview

Attendly (internally `Elan1 Attendance`) lets a small company run day-to-day HR operations from one place:

- Employees punch in/out from their phone with **GPS geofencing**
- Admins manage staff, fix attendance records, approve leaves, and export reports
- **Agents** watch attendance rules, send alerts, and answer HR questions
- Data is stored in **SQLite** and mirrored to an **Excel attendance workbook**

### Architecture

```
React + Vite (FE)  ──HTTP/JSON──>  Express + TypeScript (BE)  ──>  SQLite (node:sqlite)
                                          │
                                          ├──> Excel workbook (exceljs)
                                          ├──> LLM API (OpenAI-compatible / Groq)
                                          └──> SMTP email (nodemailer)
```

---

## Features

### Employee

- Secure login with role-aware dashboards
- **Geofenced GPS punch in/out** (Haversine distance check against the office radius)
- Live clock, worked-hours tracking, and monthly history
- Apply for leave and track approval status
- Submit **EOD (end-of-day) reports**
- Read **company policies**
- Send **direct or anonymous feedback** to admins
- Profile and password management

### Admin

- Employee directory: add, edit, search, reset passwords
- Attendance back-office: add, edit, or delete records; punch out forgotten employees
- Leave approval / rejection with notes
- Monitor & Rules dashboard: late/absence thresholds, live alert feed
- **HR Assistant** chat ("Who is absent today?", "Show late arrivals this week")
- Feature kill-switches for every optional module
- Excel downloads: full workbook or today-only sheet
- Policies upload, feedback inbox, notification bell

### Agents

| Agent | What it does | Needs AI? |
| --- | --- | --- |
| **Monitor Agent** | Every 5 minutes and after each punch: detects late arrivals, early checkouts, missing checkouts, absences, 3+ late-arrival patterns, and birthdays | No — rule-based |
| **Notification Agent** | Writes in-app bell notifications and optionally sends SMTP email alerts to admins/employees | No |
| **HR Assistant Agent** | Answers natural-language HR questions using a live attendance snapshot | Optional — falls back to rule-based answers when no key is set |

---

## Tech Stack

### Frontend

| Layer | Technology |
| --- | --- |
| Framework | React 18 |
| Language | TypeScript 5 |
| Build tool | Vite 6 |
| Styling | Hand-written CSS (`styles.css`) with light/dark theme provider |
| State | React Context (`SessionProvider`, `ThemeProvider`, `ToastProvider`) |
| Icons | Custom inline SVG components |

### Backend

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | SQLite via the built-in `node:sqlite` (`DatabaseSync`) with WAL mode |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| Security | `helmet`, `cors`, `express-rate-limit`, HTTP Basic Auth site gate, JWT token versioning |
| Files | `multer` uploads for company policies (10 MB limit, MIME allowlist) |
| Spreadsheets | `exceljs` for reading the roster and writing daily `P` marks |
| Email | `nodemailer` (optional SMTP) |
| AI | OpenAI-compatible Chat Completions API (configured for Groq, `openai/gpt-oss-120b`) |
| Config | `dotenv` |

---

## Project Structure

```
Agentic_HR_Attendance/
├── Attendly_Arch.jpeg        # Architecture diagram
├── FE/                       # React + Vite frontend
│   ├── index.html
│   ├── vite.config.ts        # Dev server on :5173, proxies /api -> :5003
│   └── src/
│       ├── App.tsx
│       ├── api.ts            # Fetch wrapper + token handling
│       ├── store.tsx         # Session / theme / toast providers
│       ├── time.ts           # Date & duration helpers
│       ├── types.ts
│       ├── components/       # Topbar, modals, settings, workspace panels
│       └── pages/            # Login, Employee, Admin, Agents, HrAsk
└── BE/                       # Express + TypeScript backend
    ├── .env.example
    └── src/
        ├── server.ts         # App bootstrap, security, routes, scheduler
        ├── types.ts
        ├── agents/           # clock, rules, features, monitor, notify, hr
        ├── db/               # database.ts (schema + seeds), excel.ts
        ├── middleware/       # auth.ts, siteGate.ts
        └── routes/           # auth, users, attendance, leaves,
                              # notifications, rules, monitor, hr,
                              # policies, eod, feedback, settings
```

---

## Getting Started

### Prerequisites

- **Node.js 22 or newer** (required for the built-in `node:sqlite` module)
- npm

### 1. Clone

```bash
git clone https://github.com/Arunkumar2004/Agentic_HR_Attendance.git
cd Agentic_HR_Attendance
```

### 2. Configure the backend

```bash
cd BE
npm install
cp .env.example .env
```

Edit `BE/.env` and set at minimum:

```env
PORT=5003
JWT_SECRET=your_long_random_secret
ADMIN_PASS=change_this_admin_password
```

Optional modules (geofence, AI, email) can be added later — see [Environment Variables](#environment-variables).

### 3. Run the backend

```bash
npm run build
npm start
# API: http://localhost:5003/api
# Health: http://localhost:5003/healthz
```

### 4. Run the frontend (development)

```bash
cd ../FE
npm install
npm run dev
# App: http://localhost:5173
```

Vite proxies `/api` to `http://127.0.0.1:5003`, so no CORS setup is needed.

### 5. Production build

```bash
cd FE && npm run build
cd ../BE && npm run build && npm start
```

The backend serves `FE/dist` automatically, so the whole app runs from one port.

### Default admin

On first run the backend seeds one admin account:

- Email: `admin@elan1.com`
- Password: value of `ADMIN_PASS` (default `admin123` — change it immediately)

---

## Environment Variables

All variables are read from `BE/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5003` | API / app port |
| `JWT_SECRET` | dev fallback | Signing key for auth tokens — set in production |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `ADMIN_PASS` | `admin123` | Seeded admin password (first run only) |
| `SITE_USER` / `SITE_PASS` | unset | Optional site-wide HTTP Basic Auth gate in front of the app |
| `DB_PATH` | `BE/elan1.db` | SQLite database location |
| `EXCEL_PATH` | `<root>/DB/Elan 1 Employee Attendance Track.xlsx` | Attendance workbook |
| `TZ_OFFICE` | `Asia/Kolkata` | Timezone used for all timestamps |
| `OFFICE_LAT` / `OFFICE_LNG` | unset | Office coordinates (geofence disabled if unset) |
| `OFFICE_RADIUS_M` | `100` | Allowed punch radius in metres |
| `LLM_API_KEY` | unset | Enables free-form HR Assistant answers |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base (example uses Groq) |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `SMTP_HOST` / `SMTP_PORT` | unset / `587` | Optional email alerts |
| `SMTP_USER` / `SMTP_PASS` | unset | SMTP credentials |
| `SMTP_FROM` | `SMTP_USER` | Sender address |
| `SMTP_SECURE` | unset | Set `1` for implicit TLS (port 465) |

---

## API Overview

| Group | Base path | Highlights |
| --- | --- | --- |
| Auth | `/api/auth` | Login, current user, change/forgot password |
| Users | `/api/users` | Admin CRUD, password reset, force logout |
| Attendance | `/api/attendance` | Punch in/out with GPS, list, manual add/edit/delete, admin punch-out |
| Leaves | `/api/leaves` | Apply, list, approve/reject |
| Notifications | `/api/notifications` | List, mark read |
| Rules | `/api/rules` | Work start, grace, checkout, absence thresholds |
| Monitor | `/api/monitor` | Agent status, recent alerts, manual run |
| HR | `/api/hr` | Ask the HR Assistant |
| Policies | `/api/policies` | Upload/download/list policy files |
| EOD | `/api/eod` | Submit and list end-of-day reports |
| Feedback | `/api/feedback` | Direct or anonymous employee feedback |
| Settings | `/api/settings` | Feature flags (admin + public) |
| Excel | `/api/excel` | `/info`, `/download`, `/today` |

Health check: `GET /healthz` (always public, bypasses the site gate).

---

## Security

- Passwords hashed with **bcrypt**
- Stateless **JWT** auth with role checks (`admin` / `employee`)
- **Token versioning** for instant force-logout across devices
- **Helmet** security headers and **rate limiting** on login and API routes
- Optional **HTTP Basic Auth site gate** before the app login screen
- **GPS geofence** validates every punch server-side
- Upload **MIME allowlist** and size cap for policy files
- Async errors are caught and logged to `crash.log` instead of crashing the process

---

## Notes

- The demo employee seed was intentionally removed — admins add real staff from the dashboard.
- If the Excel workbook is missing, the API generates it on the fly for downloads.
- The HR Assistant never invents data: it answers from a live snapshot and falls back to deterministic rule-based answers when the LLM is unavailable.
- `database.ts` includes lightweight `ALTER TABLE` migrations so older databases keep working.

---

## Author

**Arun Kumar** — [GitHub](https://github.com/Arunkumar2004)

Built as a portfolio project focused on full-stack TypeScript, agentic automation, and practical HR workflows.
