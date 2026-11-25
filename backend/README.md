# Dynamic QR-Based Attendance Management System — Node.js Backend

Production-ready backend developed in **JavaScript ES6+ (Node.js & Express.js)** with **Prisma ORM** connecting to **PostgreSQL (Supabase)**.

---

## 1. Technology Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js (ES Modules, `"type": "module"`)
- **Database & ORM**: PostgreSQL (Supabase) via Prisma ORM
- **Authentication**: JWT (`jsonwebtoken`) with Bearer tokens
- **Password & Code Security**: `bcryptjs`
- **OTP Verification**: Node.js built-in `crypto` (HMAC-SHA256 challenge binding)
- **Email Service**: Gmail API v1 via OAuth 2.0 (`googleapis`)
- **Security & Protection**: Helmet security headers, CORS origin restrictions, express-rate-limit
- **Validation**: Zod schema validation
- **Testing**: Vitest + Supertest

---

## 2. Directory Structure

```text
backend/
├── prisma/
│   └── schema.prisma         # Prisma schema mapped to existing Supabase PostgreSQL tables
├── src/
│   ├── config/
│   │   ├── database.js       # Prisma client initialization & connection lifecycle
│   │   └── environment.js    # Centralized environment variable validation
│   ├── constants/
│   │   └── catalogue.js      # Institutional course catalogue, departments, and years
│   ├── controllers/
│   │   ├── admin.controller.js       # Admin allowlist, approvals, assignments, catalogue
│   │   ├── auth.controller.js        # OTP challenges, registration, login codes, recovery
│   │   ├── teacher.controller.js     # Faculty profile & teaching assignments
│   │   └── attendance.controller.js  # QR sessions, dynamic rotation, closure
│   ├── middleware/
│   │   ├── auth.middleware.js        # JWT verification (handles TOKEN_EXPIRED, INVALID_TOKEN)
│   │   ├── admin.middleware.js       # Admin role validation guard
│   │   ├── teacher.middleware.js     # Active approved teacher role guard
│   │   ├── error.middleware.js       # Centralized error handler
│   │   └── rateLimit.middleware.js   # Rate-limiting for auth endpoints
│   ├── routes/
│   │   ├── admin.routes.js           # /api/admin
│   │   ├── auth.routes.js            # /api/auth
│   │   ├── teacher.routes.js         # /api/teacher
│   │   └── attendance.routes.js      # /api/attendance
│   ├── services/
│   │   ├── assignment.service.js     # Academic year normalization and assignment grouping
│   │   ├── email.service.js          # Gmail API (OAuth 2.0) transactional email dispatcher
│   │   ├── otp.service.js            # Cryptographic OTP challenge creation and verification
│   │   └── qr.service.js             # Dynamic rotating QR tokens and session expiration
│   ├── utils/
│   │   ├── audit.utils.js            # Security audit trail event logger
│   │   ├── response.utils.js         # Standardized API response formatters
│   │   └── token.utils.js            # Token generation and hashing utilities
│   ├── app.js                        # Express application instance and middleware pipeline
│   └── server.js                     # HTTP server entry point with graceful shutdown
├── tests/
│   ├── api.test.js                   # API endpoint protection & validation tests
│   └── services.test.js              # Business logic & timing unit tests
├── seed.js                           # Database provisioning script (Admin & Catalogue)
├── .env.example                      # Configuration template
├── package.json
└── README.md
```

---

## 3. Environment Configuration

Create a `.env` file in `backend/` based on `.env.example`:

```env
PORT=5000
NODE_ENV=development

# Supabase PostgreSQL Connection
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# JWT Secret & Expiry
JWT_SECRET="institution-attendance-jwt-secret-key-32bytes-long"
JWT_EXPIRES_IN="2h"

# OTP Security (HMAC-SHA256 secret)
OTP_HMAC_SECRET="institution-attendance-hmac-secret-key-32bytes-long"

# Gmail API (OAuth 2.0)
GMAIL_ADDRESS="your-sender@gmail.com"
GMAIL_CLIENT_ID="your-google-oauth-client-id"
GMAIL_CLIENT_SECRET="your-google-oauth-client-secret"
GMAIL_REFRESH_TOKEN="your-google-oauth-refresh-token"

# Frontend Origin for CORS
FRONTEND_URL="http://localhost:5173"
```

---

## 4. Setup and Installation

```bash
# 1. Navigate to backend
cd backend

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run prisma:generate

# 4. (Optional) Seed Admin and Catalogue data
node seed.js

# 5. Start development server with auto-reload
npm run dev

# 6. Start production server
npm start

# 7. Run test suite
npm test
```

---

## 5. API Reference & Compatibility

All routes maintain exact parity with the React frontend at `http://localhost:5173`.

### Authentication (`/api/auth`)
- `POST /teacher/check-email` — Check if institutional email is allowlisted.
- `POST /send-otp` — Request 6-digit OTP via Resend.
- `POST /verify-otp` — Verify 6-digit OTP and receive 15-minute verification token.
- `POST /register/teacher` — Complete teacher registration.
- `POST /login/code` — Sign in with email and personal login code.
- `POST /logout` — Invalidate user session.
- `POST /recovery/send-otp` — Request OTP to reset forgotten login code.
- `POST /recovery/verify-otp` — Verify recovery OTP and receive recovery token.
- `POST /recovery/reset-login-code` — Reset personal login code.

### Admin (`/api/admin`)
- `POST /login` — Admin sign-in.
- `GET /approved-teacher-emails` — List allowlisted emails.
- `POST /approved-teacher-emails` — Add single approved email.
- `POST /approved-teacher-emails/csv` — Bulk upload approved emails via CSV.
- `PATCH /approved-teacher-emails/:entry_id` — Update unused allowlisted email.
- `DELETE /approved-teacher-emails/:entry_id` — Remove email and cascade delete account.
- `GET /teachers/pending` — List pending faculty applications.
- `POST /teachers/:id/approve` (or `PATCH /faculty/:id/approve`) — Approve faculty registration.
- `POST /teachers/:id/reject` (or `PATCH /faculty/:id/reject`) — Reject faculty registration.
- `GET /departments` — List official departments.
- `PATCH /faculty/:id/department` — Update faculty department.
- `PATCH /faculty/:id/status` — Update faculty approval status.
- `POST /teachers/:id/assignments` — Add class/division/subject assignment.
- `DELETE /teachers/:id/assignments/:aid` — Remove teacher assignment.
- `GET /academic-years` — List active academic years.
- `GET /classes` — List classes.
- `GET /divisions` — List divisions.
- `GET /subjects` — List subjects.

### Teacher (`/api/teacher`)
- `GET /profile` — Fetch faculty profile and assignments.
- `PUT /profile` — Update faculty profile and teaching assignments.
- `GET /assignments` — Retrieve faculty teaching assignments.

### Attendance & Dynamic QR (`/api/attendance`)
- `POST /sessions` — Create attendance session and generate first rotating QR code.
- `GET /sessions` — List recent attendance sessions.
- `GET /sessions/:id` — Retrieve attendance session status.
- `GET /sessions/:id/current-qr` — Fetch latest dynamic rotating QR token.
- `POST /sessions/:id/close` — Conclude attendance session immediately and revoke tokens.

---

## 6. Production Deployment Guide (e.g. Render / Railway)

1. **Build Command**:
   ```bash
   npm install && npm run prisma:generate
   ```
2. **Start Command**:
   ```bash
   node src/server.js
   ```
3. Set environment variables on your cloud provider (`DATABASE_URL`, `JWT_SECRET`, `OTP_HMAC_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`).
4. The server automatically binds to `0.0.0.0:${PORT}` and handles SIGTERM/SIGINT for zero-downtime rolling deploys.
