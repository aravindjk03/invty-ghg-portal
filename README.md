# INVTY GHG Accounting Portal

Enterprise-grade Greenhouse Gas (GHG) Accounting & Inventory Portal built with a soft-neumorphic design system adhering to GHG Protocol Corporate Standard, ISO 14064-1, and BRSR Core guidelines.

---

## 🏛 Architecture & Engineering Layout

This repository is strictly partitioned into independent frontend and backend workspaces:

```
├── backend/                       # Independent Node.js / Express / TypeScript API Service
│   ├── src/
│   │   ├── config/                # Zod-validated environment variables
│   │   ├── middleware/            # Security headers (Helmet), strict CORS, Rate Limiting, Validation
│   │   ├── data/                  # Emission factor catalogue (register of record, 266 factors)
│   │   ├── services/              # GHG calculation engine, factor catalog, scenario modeling
│   │   ├── controllers/           # HTTP Request handlers
│   │   ├── routes/                # API routing (/api/v1/...)
│   │   └── types/                 # Server-side TypeScript interfaces
│   ├── .env.example               # Backend environment blueprint
│   ├── package.json               # Backend dependencies (isolated node_modules)
│   └── tsconfig.json
│
├── frontend/                      # Independent React 18 + Vite + TypeScript Client
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                # Neumorphic component primitives (Card, Button, ActivityRow, etc.)
│   │   │   ├── layout/            # TopBar, Persistent SummaryRail
│   │   │   └── charts/            # Recharts, StackedScopeBar, Interactive Sankey diagram
│   │   ├── pages/                 # Scope Hub, Scope 1-3 workspaces, Dashboard, Report Preview,
│   │   │                          # CBAM, BRSR Core, CEMS Monitor, Supplier Portal, Audit Trail,
│   │   │                          # Settings, Showcase
│   │   ├── engine/                # Decimal calculation engine + factor catalogue lookups
│   │   ├── context/               # Global GHG calculation state
│   │   ├── config/                # Route registry, environment
│   │   ├── services/              # Resilient API client with offline calculation fallback
│   │   └── types/                 # Client TypeScript interfaces
│   ├── index.css                  # Tokens on :root, forced-colors, and typography
│   ├── tailwind.config.js         # Exact token mappings
│   ├── .env.example               # Frontend environment blueprint
│   ├── package.json               # Frontend dependencies (isolated node_modules)
│   └── vite.config.ts
│
└── package.json                   # Root orchestrator scripts
```

---

## 🔒 Security Architecture

1. **HTTP Security Headers (Helmet)**:
   - Configured with Content Security Policy (CSP), Strict-Transport-Security (HSTS), frameguard against clickjacking, and mime-type sniffing defense.
2. **Strict CORS Whitelisting**:
   - Origin verification ensures only authorized frontend origins can consume the calculation and factor APIs.
3. **Input Validation (Zod)**:
   - All inbound activity entries, emission parameters, and report requests are strictly validated at the controller boundary.
4. **API Rate Limiting**:
   - Protects against brute-force and DoS using `express-rate-limit`.
5. **Secure Environment Variables**:
   - Both `frontend/` and `backend/` feature dedicated `.env.example` templates. Secrets are strictly git-ignored.
   - Startup validation ensures missing environment variables fail fast before serving traffic.
6. **Graceful Degradation**:
   - The frontend includes built-in calculation models that ensure continuous availability even if the backend is temporarily unreachable.

---

## 🚀 Getting Started

### 1. Install Dependencies
Run the root helper script (or install inside each folder individually):
```bash
# Install both backend and frontend dependencies in their respective node_modules
npm run install:all
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in both folders:
```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

### 3. Start Development Servers
In two separate terminals:
```bash
# Terminal 1: Backend API (runs on port 5000)
npm run dev:backend

# Terminal 2: Frontend Client (runs on port 5173)
npm run dev:frontend
```

### 4. Build
```bash
# Verifies catalogue sync, then builds backend and frontend
npm run build
```

---

## 📚 Emission Factor Register

The backend is the **register of record** for emission factors and serves the full
266-entry catalogue from `backend/src/data/emission_source_catalogue.json`:

```
GET /api/v1/factors                      # all factors
GET /api/v1/factors?scope=scope-1        # one scope
GET /api/v1/factors?ghgCategory=1.2      # one GHG Protocol category (mobile combustion)
GET /api/v1/factors/:activityKey         # a single factor
```

The frontend ships a byte-identical snapshot at
`frontend/src/data/emission_source_catalogue.json` purely so the app keeps working
offline. The two must not diverge — a row saved against one catalogue would resolve
to a different factor in the other — so the build verifies them:

```bash
npm run check:catalogue   # fails the build if they differ (runs as part of npm run build)
npm run sync:catalogue    # refresh the frontend snapshot from the backend register
```

Factors are addressed by GHG Protocol category (`1.1` stationary combustion, `1.2`
mobile combustion, `3.6` business travel, …). `frontend/src/engine/factorCatalogue.ts`
maps the app's category keys onto those codes, which is what keeps each workspace's
source picker scoped to the category being edited rather than the whole scope.

---

## 🎨 Design System Principles
- **Base Canvas**: `#EDF1F7` (never pure `#FFFFFF`).
- **Raised Surfaces**: `#FFFFFF` with dual soft shadows (`--nm-raised`).
- **Mandatory Borders**: Every interactive component has a visible 1px `#DCE4F0` border in addition to its shadow.
- **Focus Rings**: Standardized `outline: 2px solid var(--blue-600); outline-offset: 2px` (never box-shadow).
- **Two-Tier Surface Rule**: Neumorphism for containers ≥ 80px; flat surfaces with hairline dividers for dense data tables and rows.
- **High Contrast Support**: Full `@media (forced-colors: active)` support for Windows High Contrast Mode.
