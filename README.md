<p align="center">
  <img src="logo.png" alt="Rust+ Web Dashboard" width="120" />
</p>

<h1 align="center">Rust+ Web Dashboard</h1>

<p align="center">
  Multi-tenant SaaS dashboard for Rust server operations with distributed connection nodes.
</p>

---

## Quick Start

### 1) Prerequisites

- Node.js 20+
- MySQL 8+

### 2) Configure `.env`

```bash
cp .env.example .env
```

Fill database, JWT, `INTERNAL_API_TOKEN`, and frontend URL settings.

### 3) Initialize database

```bash
mysql -u root -p < backend/sql/init.sql
```

> `backend/sql/init.sql` is the only schema script kept in this project.

### 4) Start main node

```powershell
./start-main.ps1
```

### 5) Start connector node (optional)

```powershell
./start-connector.ps1
```

### 6) Start frontend dev server

```bash
cd frontend
npm install
npm run dev
```

Default URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000/api

## Docs

- Docs index: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Database: `docs/DATABASE.md`
- Low-cost distributed deployment: `docs/LOW_COST_DISTRIBUTED.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`

## License

[MIT License](LICENSE)
