<p align="center">
  <img src="logo.png" alt="Rust+ Web Dashboard" width="120" />
</p>

<h1 align="center">Rust+ Web Dashboard</h1>

<p align="center">
  Multi-tenant SaaS dashboard for Rust server operations with distributed connection nodes.
</p>

---

## Quick Start (local development)

> 🚀 Production deployment & operations → see **[`DEPLOYMENT.md`](DEPLOYMENT.md)** (server, directories, env vars, deploy scripts, gotchas).

### 1) Prerequisites

- Node.js 20+
- MySQL 8+

### 2) Configure `.env`

```bash
cp .env.example .env
```

Fill database, JWT, `NODE_TOKEN_SECRET`, and frontend URL settings.

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

Issue a node token on the main host (the `nodeId` becomes the node's identity), then set it as `NODE_TOKEN` in the connector's `.env`:

```bash
node backend/scripts/issue-node-token.js node-1
```

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

- **Deployment & operations (production): [`DEPLOYMENT.md`](DEPLOYMENT.md)**
- Docs index: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Database: `docs/DATABASE.md`
- Low-cost distributed deployment: `docs/LOW_COST_DISTRIBUTED.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`

## License

[MIT License](LICENSE)
