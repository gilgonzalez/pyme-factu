# ADR-006 — Autenticación con Better Auth (sin su plugin de organizaciones)

- **Estado:** Propuesta (24/11/2026) — se implementa y valida en Fase 2

**Contexto.** El prompt pide Auth.js «o alternativa compatible y mantenida». A 24/11/2026: `next-auth` estable es 4.24.15 (Auth.js v5 sigue en `5.0.0-beta.32`); `better-auth` 1.7.27 es estable y declara compatibilidad con Next 16, Prisma 7 y Vitest 5.

**Problema.** Registro, login, verificación de email, recuperación de contraseña y gestión/cierre de sesiones con una librería estable, sin ceder la multi-tenancy a terceros.

**Alternativas.** (1) Auth.js v5 beta. (2) next-auth v4 (diseño antiguo, credenciales limitadas). (3) Better Auth. (4) Implementación propia.

**Decisión.** (3) solo para **identidad** (users, sessions, accounts, verifications), con su propio rol de BD `facturalibre_auth`. Tenants, membresías e invitaciones son nuestros (RLS); no se usa su plugin de organizaciones.

**Justificación.** Estable, mantenida, cubre los flujos exigidos; separar identidad de tenancy mantiene el aislamiento bajo nuestro control.

**Consecuencias.** Las tablas de identidad ya siguen su forma; en Fase 2 se verificará campo a campo contra su esquema y se ajustará con una migración si hace falta. Rate limiting, CSRF y cookies seguras se validarán en esa fase.
