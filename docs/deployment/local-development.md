# Desarrollo local

Requisitos: Node.js ≥ 22.12 y pnpm 10.34 (`npm i -g pnpm@10.34.9`). Docker es opcional.

## Opción A — sin Docker (verificada el 24/11/2026 en Windows 11)

```bash
pnpm install
pnpm env:init            # crea .env con secretos aleatorios (no sobrescribe uno existente)
pnpm db:local            # terminal 1: PostgreSQL 18 embebido en .data/postgres (Ctrl+C para parar)
pnpm db:migrate          # terminal 2: roles + migraciones (idempotente)
pnpm dev                 # web en http://localhost:3000 y worker (health en :8081)
```

Comprobación: `curl http://localhost:3000/api/health` → `{"status":"ok","checks":{"database":"ok"}}`.

## Opción B — con Docker

Ver [docker](docker.md).

## Comandos de calidad

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm lint` | ESLint (prohíbe `any` y la importación directa del cliente Prisma) |
| `pnpm test` | Unitarias + integración contra PostgreSQL real efímero (no necesita `db:local`) |
| `pnpm build` | Build de producción (web standalone) |
| `pnpm e2e` | Playwright contra la build. La primera vez: `pnpm --filter @facturalibre/web exec playwright install chromium`. Con BD migrada y variables del `.env` cargadas: `E2E_EXPECT_DATABASE=1 pnpm e2e` |
| `pnpm crap` · `pnpm dry` · `pnpm mutate` | Métricas ub-mode: CRAP < 10, duplicación, mutación |
