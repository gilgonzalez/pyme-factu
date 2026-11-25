# Arquitectura de seguridad

## Estado

| Control | Estado |
|---|---|
| Aislamiento entre tenants (RLS + FKs compuestas + TenantContext) | ✅ probado |
| Autorización centralizada por permisos, anti-escalada | ✅ probado |
| Mínimo privilegio en BD (roles app/auth/worker sin BYPASSRLS) | ✅ probado |
| Auditoría append-only | ✅ probado; eventos de negocio en la misma transacción que el cambio (`tenant.created`, `invitation.*`, `member.*`, `tenant.ownership_transferred`) |
| Cabeceras de seguridad (nosniff, DENY frames, Referrer-Policy, Permissions-Policy, sin X-Powered-By) | ✅ probado (E2E) |
| Cliente de BD marcado `server-only` | ✅ (el build falla si se importa desde código de cliente) |
| Validación de entradas no confiables (slug, UUID) en el borde | ✅ |
| Autenticación (email + contraseña 12–128, hash scrypt), verificación de email obligatoria, recuperación con token de 1 h que cierra todas las sesiones | ✅ probado (`packages/auth`, E2E) — [ADR-006](../decisions/ADR-006-authentication.md) |
| Sesiones: cookie `HttpOnly`, `SameSite=Lax` (`Secure` con HTTPS), 7 días, renovación diaria; operaciones sensibles exigen sesión iniciada hace ≤ 10 min | ✅ probado |
| CSRF: comprobación de `Origin` en `/api/auth/*` (forzada también en pruebas) y en Server Actions (Next.js) | ✅ probado (403 con Origin ajeno) |
| Rate limiting persistente en PostgreSQL (`rate_limits`, rol auth): login 5/15 min, registro 10/h, recuperación 3/15 min por IP. Desactivado solo con `FACTURALIBRE_ENV=development` | ✅ probado (429) |
| Redirecciones abiertas (`?volver=`): solo rutas internas (`safeReturnPath`) | ✅ probado (unitario + E2E) |
| Tokens de invitación: 32 bytes aleatorios, solo su SHA-256 en BD, 7 días, un solo uso, ligados al email; página con `Referrer-Policy: no-referrer` | ✅ probado |
| CSP | ✅ Fase 7 (`next.config.ts`, comprobada en E2E): `default-src 'self'`, sin objetos, marcos, `base-uri` ni formularios hacia fuera, imágenes propias y `data:` (QR); en producción `upgrade-insecure-requests` y HSTS. ⚠️ Riesgo residual: `script-src` admite `'unsafe-inline'` porque los nonces obligarían a renderizar todo dinámicamente y anularían el prerender parcial (`cacheComponents`); lo mitigan el escapado de React y la ausencia de HTML inyectado. Revisar si Next ofrece hashes de sus scripts de arranque |
| Cifrado de certificados | ✅ Fase 6: cifrado por sobre (DEK AES-256-GCM por certificado envuelta con `CERTIFICATE_KEK`, que nunca está en la BD); validado al subirlo; solo se descifra en memoria en el worker; nunca vuelve al navegador ([integration-architecture](../aeat/integration-architecture.md)) |

## Modelo de amenazas (resumen)

| Amenaza | Ejemplo | Mitigación |
|---|---|---|
| Acceso horizontal (IDOR) | Cambiar slug o id en la URL | Membresía verificada en servidor; RLS con `authorized_tenant_id()`; respuesta idéntica para inexistente/ajeno |
| Escalada vertical | EMPLOYEE se nombra ADMIN | `decideRoleChange`; rol nunca leído del cliente |
| Error de aplicación que fija otro tenant | Bug en un Server Action | RLS exige membresía del `app.user_id` (probado) |
| Fuga de contexto por pool | Conexión reutilizada | `SET LOCAL` (probado con pool de 1) |
| Inyección SQL | Parámetros | Prisma/pg parametrizados; identificadores dinámicos con `escapeIdentifier` |
| XSS | Datos de clientes en la UI | Escapado de React; HTML de correos escapado (`escapeHtml`, probado); sin `dangerouslySetInnerHTML`; CSP (Fase 7, con `'unsafe-inline'` en scripts: ver arriba) |
| CSRF | Server Actions | Comprobación de Origin (Better Auth en `/api/auth/*`, Next.js en Server Actions) + cookies `SameSite=Lax` ✅ |
| Fuerza bruta | Login | Rate limiting persistente en PostgreSQL ✅; contraseñas ≥ 8 caracteres (bajado de 12 a petición del usuario el 25/11/2026; NIST SP 800-63B admite 8 como mínimo) |
| Robo de certificados | Volcado de BD | Cifrado por sobre con KEK fuera de la BD ✅ (`certificates.test.ts`: sin la KEK no se abre; una manipulación se detecta) |
| Manipulación de auditoría | UPDATE/DELETE | Sin GRANT + trigger (incluso para el propietario) |
| Acceso del personal de plataforma | Soporte | Sin bypass; acceso temporal autorizado y auditado |

## Secretos

`.env` local generado con `pnpm env:init` (ignorado por git); en producción, variables del orquestador o gestor de secretos. Contraseñas de roles de BD ≥ 16 caracteres (validado). Nunca secretos en logs, auditoría ni repositorio.

## Certificados digitales (✅ Fase 6; el diseño original se mantiene)

Cifrado por sobre: cada certificado PKCS#12 se cifra con una DEK aleatoria (AES-256-GCM); la DEK se cifra con una KEK que **no** está en la base de datos (gestor de secretos/KMS; en local, variable de entorno). Metadatos (titular, NIF, caducidad, huella) en claro para alertas de caducidad. Descifrado solo en el worker, en memoria, durante el envío. Gestión con permiso `certificates.manage`, auditada; rotación y revocación = nuevo certificado + desactivación del anterior. Alternativas (HSM/PKCS#11, certificado custodiado por el cliente) en un ADR propio en Fase 6.

## Auditoría

`audit_events`: quién (`actor_user_id`), dónde (`tenant_id`, `taxpayer_id`), qué (`action`, `entity_type`, `entity_id`), resultado (`SUCCESS`/`DENIED`/`FAILURE`), correlación (`request_id`) y metadatos mínimos sin secretos. Append-only. Los intentos denegados contra otro tenant se registran con `tenant_id` NULL.
