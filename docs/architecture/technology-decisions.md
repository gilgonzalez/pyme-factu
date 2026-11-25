# Tecnologías y versiones

Versiones comprobadas en el registro npm el **24/11/2026** (`npm view <paquete> version|dist-tags|peerDependencies`). Se fija la última **estable** compatible; nunca una etiqueta `rc`/`beta` en componentes críticos.

| Área | Elegido | Última publicada | Motivo de la elección |
|---|---|---|---|
| Node.js | 22 (local 22.18.0; Docker `node:22-alpine`) | — | LTS; requisito de Prisma 7 `^22.12` |
| pnpm | 10.34.9 | 12.23.0 | Rama madura; corepack local roto. Evaluado en la Fase 7: no se migra todavía (cambia el lockfile de todo el monorepo y el `packageManager` de CI y Docker); pendiente de una rama propia |
| Turborepo | 2.11.13 | 2.11.13 | — |
| TypeScript | 6.0.3 | 7.0.2 | `typescript-eslint` 8.74 exige `<6.1.0`; TS 7 (compilador nativo) aún sin soporte del ecosistema |
| Next.js | 16.4.6 (App Router, Turbopack, `output: standalone`, `cacheComponents`) | 16.4.6 | — |
| React | 19.3.1 | 19.3.1 | — |
| Tailwind CSS | 4.3.5 | 4.3.5 | — |
| shadcn/ui | CLI 4.23.0, estilo `base-nova` (Base UI), utilidad `cn` | — | Generado por la CLI oficial; `cn` publicado por la organización `shadcn-ui` (verificado) |
| PostgreSQL | 18 (`postgres:18-alpine`; `uuidv7()` nativo) | — | `uuidv7()` ordenable para claves |
| Prisma | 7.10.1 + `@prisma/adapter-pg` | 8.0.0-rc.35 (`latest` apunta a RC) | 8.x no es estable |
| node-postgres | 8.23.1 | — | Adaptador de Prisma; scripts de bootstrap |
| Vitest | 5.1.1 | 5.1.1 | Proyectos por paquete |
| Playwright | 1.65.1 | 1.65.1 | Chromium escritorio + Pixel 7 |
| ESLint | 9.39.5 | 10.15.0 | Los plugins de `eslint-config-next` 16.4.6 (react, import, jsx-a11y) declaran soporte hasta ESLint 9. npm marca 9.x como *deprecated*: **Revisado en la Fase 7**: `eslint-plugin-react` (incluido en `eslint-config-next`) sigue admitiendo solo ESLint ≤ 9.7, así que se mantiene ESLint 9 |
| embedded-postgres | 18.7.0-beta.19 (solo desarrollo/pruebas) | 19.0.0-beta.20 | Binarios oficiales de PostgreSQL sin Docker; el paquete solo publica versiones *beta*. No forma parte del producto |
| tsx | 4.23.15 | — | Ejecuta el worker y scripts TS |
| pdf-lib | 1.17.1 | 1.17.1 | PDF de la factura (`packages/invoice-pdf`). Elegido frente a PDFKit: JavaScript puro, sin `fs` ni ficheros de fuentes (las 14 estándar, WinAnsi: lo que no se puede escribir sale «?»), funciona igual en Next, Docker y Windows. Sin mantenimiento activo desde 2021: se revisa si aparece un fallo |
| Zod, React Hook Form, decimal.js, pg-boss | **no instalados** | — | Se instalan en la fase que los usa (regla: sin dependencias sin uso) |

## Calidad (herramientas del proyecto, ub-mode)

- `pnpm crap` — CRAP < 10 por función (Vitest + cobertura v8).
- `pnpm dry` — jscpd, similitud ≥ 0,8 (excluye código generado, migraciones históricas y CSS generado por shadcn).
- `pnpm mutate` — Stryker sobre `packages/security` (lógica pura), umbral 80 %. Paquetes puros con su propia configuración y objetivo 100 %: `mutate:domain`, `mutate:fiscal-core`, `mutate:verifactu`, `mutate:aeat-client`, `mutate:invoice-pdf`.
