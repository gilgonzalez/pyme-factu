# ADR-006 — Autenticación con Better Auth (sin su plugin de organizaciones)

- **Estado:** Aceptada (24/11/2026) — implementada y validada en Fase 2 con `better-auth` 1.7.27

**Contexto.** El prompt pide Auth.js «o alternativa compatible y mantenida». A 24/11/2026: `next-auth` estable es 4.24.15 (Auth.js v5 sigue en `5.0.0-beta.32`); `better-auth` 1.7.27 es estable y declara compatibilidad con Next 16, Prisma 7 y Vitest 5.

**Problema.** Registro, login, verificación de email, recuperación de contraseña y gestión/cierre de sesiones con una librería estable, sin ceder la multi-tenancy a terceros.

**Alternativas.** (1) Auth.js v5 beta. (2) next-auth v4 (diseño antiguo, credenciales limitadas). (3) Better Auth. (4) Implementación propia.

**Decisión.** (3) solo para **identidad** (users, sessions, accounts, verifications), con su propio rol de BD `facturalibre_auth`. Tenants, membresías e invitaciones son nuestros (RLS); no se usa su plugin de organizaciones.

**Justificación.** Estable, mantenida, cubre los flujos exigidos; separar identidad de tenancy mantiene el aislamiento bajo nuestro control.

**Consecuencias.** Las tablas de identidad ya siguen su forma; en Fase 2 se verificará campo a campo contra su esquema y se ajustará con una migración si hace falta. Rate limiting, CSRF y cookies seguras se validarán en esa fase.

**Resultado de la validación (Fase 2, 24/11/2026).**
- Las tablas `users`, `sessions`, `accounts` y `verifications` encajan campo a campo con el adaptador Prisma de Better Auth: no ha hecho falta migración. Se añadió `rate_limits` (solo rol auth) para el rate limiting persistente. Identificadores: `advanced.database.generateId: "uuid"`.
- Better Auth guarda el email en minúsculas, compatible con el CHECK `users_email_lowercase` (probado).
- Better Auth desactiva la comprobación de Origin cuando `NODE_ENV=test`; se fija `disableOriginCheck: false` para que las pruebas ejerciten la misma protección CSRF que producción.
- El rate limiting solo se aplica en el handler HTTP (`/api/auth/*`), no en llamadas `auth.api.*` desde el servidor. Por eso registro, inicio de sesión y recuperación se hacen desde el navegador con el cliente de Better Auth, nunca con Server Actions.
- Configuración: `packages/auth/src/auth.ts`. Pruebas: `packages/auth/test/auth.test.ts` (12) y `apps/web/e2e/team.spec.ts`.
