# FacturaLibre

Plataforma SaaS **gratuita** y multi-tenant de facturación para autónomos, empresas y gestorías en España, diseñada para la modalidad **VERI*FACTU**.

> **Estado: Fase 1 (esqueleto técnico).** Todavía **no** emite facturas ni registros de facturación y **no** se comunica con la AEAT. FacturaLibre **no está homologado ni certificado** por la Agencia Tributaria. Estado detallado en [docs/README.md](docs/README.md).

## Qué hay hoy

- Monorepo pnpm + Turborepo, TypeScript estricto.
- `apps/web` — Next.js 16, Tailwind 4, shadcn/ui; página pública y `GET /api/health`.
- `apps/worker` — proceso asíncrono (health check y ciclo de vida; aún sin trabajos).
- `packages/database` — Prisma 7 + PostgreSQL 18, migraciones con **RLS en todas las tablas**, roles de BD sin BYPASSRLS.
- `packages/security` — permisos granulares y reglas anti-escalada.
- `packages/tenancy` — `TenantContext` y `runInTenant`, único acceso a datos de una organización.
- Pruebas de aislamiento entre organizaciones contra PostgreSQL real.

## Arranque desde cero

Requisitos: Node.js ≥ 22.12 y pnpm 10.34 (`npm i -g pnpm@10.34.9`).

### Sin Docker

```bash
pnpm install
pnpm env:init          # genera .env con contraseñas aleatorias
pnpm db:local          # terminal 1: PostgreSQL 18 local en .data/postgres
pnpm db:migrate        # terminal 2: roles + migraciones
pnpm dev               # http://localhost:3000
```

### Con Docker (verificado el 24/11/2026)

```bash
pnpm env:init
docker compose up -d --build
```

### Verificar

```bash
pnpm typecheck && pnpm lint && pnpm test      # las pruebas arrancan su propio PostgreSQL efímero
pnpm build
pnpm --filter @facturalibre/web exec playwright install chromium   # solo la primera vez
pnpm e2e
```

Más detalle: [desarrollo local](docs/deployment/local-development.md) · [Docker](docs/deployment/docker.md) · [arquitectura](docs/architecture/overview.md) · [VERI*FACTU](docs/verifactu/technical-overview.md).
