# ADR-001 — Monolito modular en monorepo pnpm + Turborepo

- **Estado:** Aceptada (24/11/2026)

**Contexto.** Producto nuevo, equipo pequeño, requisitos fuertes de integridad transaccional (factura + registro fiscal + outbox en una transacción) y de aislamiento.

**Problema.** Elegir una estructura que separe responsabilidades sin pagar el coste operativo de un sistema distribuido.

**Alternativas.** (1) Microservicios desde el inicio. (2) Una sola aplicación Next.js sin paquetes. (3) Monolito modular con paquetes de dominio y un worker.

**Decisión.** (3): `apps/web` (Next.js), `apps/worker` (Node) y paquetes con API pública y dependencias unidireccionales. Cola duradera en PostgreSQL (Transactional Outbox), sin Redis.

**Justificación.** Las operaciones fiscales críticas necesitan transacciones ACID en una sola BD; los microservicios obligarían a sagas. Los paquetes permiten pruebas aisladas (lógica pura sin E/S) y una futura extracción (`aeat-client` + worker).

**Consecuencias.** Un despliegue con dos procesos. Disciplina de dependencias vigilada por ESLint y revisión. Si el outbox propio no basta para reintentos/planificación, se evaluará `pg-boss` (también sobre PostgreSQL) en Fase 6.
