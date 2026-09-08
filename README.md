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
│   │   ├── pages/                 # Showcase, Scope Hub, Scope 1 Workspace, Dashboard, Report Preview
│   │   ├── context/               # Global GHG calculation state
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

---

## 🎨 Design System Principles
- **Base Canvas**: `#EDF1F7` (never pure `#FFFFFF`).
- **Raised Surfaces**: `#FFFFFF` with dual soft shadows (`--nm-raised`).
- **Mandatory Borders**: Every interactive component has a visible 1px `#DCE4F0` border in addition to its shadow.
- **Focus Rings**: Standardized `outline: 2px solid var(--blue-600); outline-offset: 2px` (never box-shadow).
- **Two-Tier Surface Rule**: Neumorphism for containers ≥ 80px; flat surfaces with hairline dividers for dense data tables and rows.
- **High Contrast Support**: Full `@media (forced-colors: active)` support for Windows High Contrast Mode.
