# Políticas RLS

Estado: ✅ implementado (migraciones `…0100_security_rls` y `…0200_taxpayer_access_level`) y probado contra PostgreSQL 18 real.

## Roles de base de datos

| Rol | Uso | Propietario de tablas | BYPASSRLS |
|---|---|:-:|:-:|
| *(propietario / migrador)* | Solo `pnpm db:migrate` | Sí | — (nunca en ejecución) |
| `facturalibre_app` | Aplicación web | No | No |
| `facturalibre_auth` | Librería de autenticación (solo `users`, `sessions`, `accounts`, `verifications`, `user_profiles`) | No | No |
| `facturalibre_worker` | Worker (outbox; dominio siempre con contexto de tenant) | No | No |

No se usa `FORCE ROW LEVEL SECURITY`: las funciones `SECURITY DEFINER` (propiedad del migrador) necesitan leer membresías sin recursión de políticas, y el propietario nunca se usa en ejecución. Una prueba verifica que ningún rol de ejecución es propietario ni tiene BYPASSRLS.

## Contexto de seguridad

Variables locales a la transacción fijadas por `withSecurityContext` con `set_config(nombre, valor, true)` (≡ `SET LOCAL`):

| Variable | Función de lectura | Nota |
|---|---|---|
| `app.user_id` | `app.current_user_id()` | |
| `app.tenant_id` | `app.current_tenant_id()` | |
| `app.taxpayer_id` | `app.current_taxpayer_id()` | Reservada para tablas fiscales (Fase 4+) |
| — | `app.authorized_tenant_id()` | Devuelve `current_tenant_id()` **solo si** el usuario del contexto tiene membresía ACTIVA; si no, NULL → cero filas |
| — | `app.taxpayer_access_level(id)` | `'FULL'`, `'READ_ONLY'` o NULL según alcance y asignación |
| — | `app.can_access_taxpayer(id)` / `app.can_write_taxpayer(id)` | Derivadas de la anterior |

Al acabar la transacción las variables vuelven a `''` (no a NULL); por eso las funciones usan `NULLIF(…, '')`. Sin contexto, todas las políticas devuelven cero filas.

## Políticas por tabla (rol `facturalibre_app`)

| Tabla | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `users` | uno mismo, o miembros del tenant autorizado | UPDATE solo de sí mismo y solo columnas `name`, `image` |
| `user_profiles` | propio | propio |
| `sessions`, `accounts`, `verifications` | **sin permiso** (`permission denied`) | — |
| `tenants` | el autorizado + aquellos con membresía activa propia (selector de organización) | UPDATE del autorizado; sin INSERT directo (Fase 2: función `SECURITY DEFINER` de alta) |
| `tenant_settings` | tenant autorizado | tenant autorizado |
| `tenant_memberships` | propias + las del tenant autorizado | tenant autorizado |
| `tenant_invitations` | tenant autorizado | tenant autorizado |
| `taxpayers` | tenant autorizado **y** `can_access_taxpayer(id)` | INSERT en tenant autorizado; UPDATE si `can_write_taxpayer`; sin DELETE |
| `taxpayer_settings` | `can_access_taxpayer` | `can_write_taxpayer` |
| `taxpayer_memberships` | tenant autorizado | tenant autorizado |
| `audit_events` | tenant autorizado | INSERT solo con `actor_user_id = app.current_user_id()` y tenant NULL o autorizado; **sin UPDATE/DELETE** (sin GRANT y trigger que lo rechaza incluso al propietario) |
| `outbox_events` | tenant autorizado | INSERT en tenant autorizado |

Rol `facturalibre_worker`: `outbox_events` SELECT/UPDATE en todos los tenants (reclamar trabajos); `audit_events` SELECT/INSERT solo del `app.current_tenant_id()` fijado desde el evento y sin actor de usuario; **sin acceso** a tablas de dominio (las políticas de dominio para el worker se añadirán, tenant a tenant, cuando procese trabajos fiscales).

## Uso desde Prisma

Siempre dentro de `runInTenant(db, ctx, permiso, tx => …)`; `tx` es el cliente transaccional con el contexto fijado. Consultas con el cliente raíz fuera de `runInTenant` no ven datos de tenants (probado con pool de una conexión).
