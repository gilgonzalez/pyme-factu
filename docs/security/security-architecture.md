# Arquitectura de seguridad

## Estado

| Control | Estado |
|---|---|
| Aislamiento entre tenants (RLS + FKs compuestas + TenantContext) | ✅ probado |
| Autorización centralizada por permisos, anti-escalada | ✅ probado |
| Mínimo privilegio en BD (roles app/auth/worker sin BYPASSRLS) | ✅ probado |
| Auditoría append-only | ✅ probado (registro de eventos de negocio: Fase 2) |
| Cabeceras de seguridad (nosniff, DENY frames, Referrer-Policy, Permissions-Policy, sin X-Powered-By) | ✅ probado (E2E) |
| Cliente de BD marcado `server-only` | ✅ (el build falla si se importa desde código de cliente) |
| Validación de entradas no confiables (slug, UUID) en el borde | ✅ |
| Autenticación, sesiones, CSRF, rate limiting | 📄 Fase 2 ([ADR-006](../decisions/ADR-006-authentication.md)) |
| CSP con nonces | ⏳ Fase 2 |
| Cifrado de certificados | 📄 Fase 6 |

## Modelo de amenazas (resumen)

| Amenaza | Ejemplo | Mitigación |
|---|---|---|
| Acceso horizontal (IDOR) | Cambiar slug o id en la URL | Membresía verificada en servidor; RLS con `authorized_tenant_id()`; respuesta idéntica para inexistente/ajeno |
| Escalada vertical | EMPLOYEE se nombra ADMIN | `decideRoleChange`; rol nunca leído del cliente |
| Error de aplicación que fija otro tenant | Bug en un Server Action | RLS exige membresía del `app.user_id` (probado) |
| Fuga de contexto por pool | Conexión reutilizada | `SET LOCAL` (probado con pool de 1) |
| Inyección SQL | Parámetros | Prisma/pg parametrizados; identificadores dinámicos con `escapeIdentifier` |
| XSS | Datos de clientes en la UI | Escapado de React; CSP (Fase 2); sin `dangerouslySetInnerHTML` |
| CSRF | Server Actions | Comprobación de Origin de Next.js + cookies `SameSite=Lax` (Fase 2) |
| Fuerza bruta | Login | Rate limiting persistente en PostgreSQL (Fase 2) |
| Robo de certificados | Volcado de BD | Cifrado por sobre con KEK fuera de la BD (Fase 6) |
| Manipulación de auditoría | UPDATE/DELETE | Sin GRANT + trigger (incluso para el propietario) |
| Acceso del personal de plataforma | Soporte | Sin bypass; acceso temporal autorizado y auditado |

## Secretos

`.env` local generado con `pnpm env:init` (ignorado por git); en producción, variables del orquestador o gestor de secretos. Contraseñas de roles de BD ≥ 16 caracteres (validado). Nunca secretos en logs, auditoría ni repositorio.

## Certificados digitales (diseño, Fase 6)

Cifrado por sobre: cada certificado PKCS#12 se cifra con una DEK aleatoria (AES-256-GCM); la DEK se cifra con una KEK que **no** está en la base de datos (gestor de secretos/KMS; en local, variable de entorno). Metadatos (titular, NIF, caducidad, huella) en claro para alertas de caducidad. Descifrado solo en el worker, en memoria, durante el envío. Gestión con permiso `certificates.manage`, auditada; rotación y revocación = nuevo certificado + desactivación del anterior. Alternativas (HSM/PKCS#11, certificado custodiado por el cliente) en un ADR propio en Fase 6.

## Auditoría

`audit_events`: quién (`actor_user_id`), dónde (`tenant_id`, `taxpayer_id`), qué (`action`, `entity_type`, `entity_id`), resultado (`SUCCESS`/`DENIED`/`FAILURE`), correlación (`request_id`) y metadatos mínimos sin secretos. Append-only. Los intentos denegados contra otro tenant se registran con `tenant_id` NULL.
