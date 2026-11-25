# FacturaLibre

Plataforma SaaS **gratuita** y multi-tenant de facturación para autónomos, empresas y gestorías en España, diseñada para la modalidad **VERI*FACTU**.

> **Estado: fin de la Fase 7 + PDF de la factura (25/11/2026).** Emite facturas con registro VERI*FACTU encadenado, QR tributario (en la ficha y en el PDF) y remisión a la AEAT, que **solo se ha probado contra el simulador propio**: falta el portal de pruebas de la AEAT (certificado y NIF reales) y la declaración responsable del productor. **No usar en producción.** FacturaLibre **no está homologado ni certificado** por la Agencia Tributaria (no existe tal homologación: el productor declara que cumple). Estado detallado en [docs/README.md](docs/README.md).

## Qué hay hoy

- Monorepo pnpm + Turborepo, TypeScript estricto.
- `apps/web` — Next.js 16, Tailwind 4, shadcn/ui: registro, organizaciones y equipo, contribuyentes, clientes, productos, facturas (borrador, emisión, rectificativa, anulación, **PDF con QR**), registros VERI*FACTU, certificado, cuenta (exportación y baja).
- `apps/worker` — remisión periódica de los registros a la AEAT (control de flujo, reintentos, incidencias).
- `packages/database` — Prisma 7 + PostgreSQL 18, migraciones con **RLS en todas las tablas**, roles de BD sin BYPASSRLS.
- `packages/security` — permisos granulares y reglas anti-escalada.
- `packages/tenancy` — `TenantContext` y `runInTenant`, único acceso a datos de una organización.
- `packages/domain`, `packages/fiscal-core` — NIF y cálculo de facturas (importes enteros escalados).
- `packages/verifactu` — huella, registros, XML (validado con los XSD oficiales) y QR.
- `packages/aeat-client` — remisión SOAP con certificado, respuesta, plazos y simulador.
- `packages/invoice-pdf` — PDF A4 de la factura con el QR tributario en su sitio.
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
