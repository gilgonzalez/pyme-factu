# Matriz de autorización de endpoints

Toda operación sobre datos de un tenant se ejecuta con `runInTenant(db, ctx, <permiso>, …)`. Esta tabla crece con cada Server Action / Route Handler.

| Endpoint / acción | Método | Autenticación | Permiso | Estado |
|---|---|---|---|---|
| `/` | GET | Pública | — | ✅ |
| `/api/health` | GET | Pública (solo `SELECT 1`, sin datos de tenants) | — | ✅ |
| Worker `:8081/health` | GET | Red interna | — | ✅ |
| `/api/auth/*` (registro, inicio y cierre de sesión, verificación, recuperación) | GET/POST | Pública o sesión según endpoint; Origin comprobado; rate limiting persistente | — (rol BD `facturalibre_auth`) | ✅ `packages/auth/test/auth.test.ts` |
| `/organizaciones` — listar mis organizaciones | Server Component | Sesión | (propias membresías ACTIVAS, RLS) | ✅ `team.test.ts`, E2E |
| `/nueva-organizacion` — crear organización | Server Action | Sesión + email verificado | — (`app.create_tenant`, `SECURITY DEFINER`) | ✅ `onboarding.test.ts`, `team.test.ts`, E2E |
| `/[organizacion]/equipo` — ver miembros e invitaciones | Server Component | Sesión | `members.read` | ✅ `team.test.ts`, E2E |
| Invitar miembro | Server Action | Sesión | `members.invite` + `decideRoleChange` | ✅ `team.test.ts`, E2E |
| Anular invitación | Server Action | Sesión | `members.invite` | ✅ `team.test.ts` |
| Cambiar rol | Server Action | Sesión | `members.update_role` + `decideRoleChange` | ✅ `team.test.ts`, E2E |
| Quitar miembro | Server Action | Sesión | `members.remove` + `decideMemberRemoval` | ✅ `team.test.ts` |
| Transferir propiedad | Server Action | Sesión iniciada hace ≤ 10 min + escribir el slug | `tenant.transfer_ownership` | ✅ `team.test.ts` |
| `/invitacion/[token]` — ver y aceptar invitación | Server Component + Server Action | Sesión + email verificado y coincidente | — (`app.invitation_preview` / `app.accept_invitation`) | ✅ `onboarding.test.ts`, E2E |
| Crear contribuyente | Server Action | Sesión | `taxpayers.create` | 📄 Fase 3 (necesita la validación de NIF del dominio) |
| Asignar acceso a contribuyente | Server Action | Sesión | `taxpayers.manage_access` | 📄 Fase 3 |

Matriz rol → permiso: [roles-and-permissions](../tenancy/roles-and-permissions.md).
