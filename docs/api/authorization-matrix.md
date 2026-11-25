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
| `/[organizacion]/contribuyentes` — listar contribuyentes accesibles | Server Component | Sesión | `taxpayers.read` (RLS: solo los accesibles) | ✅ `taxpayers.test.ts`, E2E |
| Crear contribuyente (NIF validado; tipo de persona deducido) | Server Action | Sesión | `taxpayers.create` | ✅ `taxpayers.test.ts`, E2E |
| `/[organizacion]/contribuyentes/[id]` — ficha | Server Component | Sesión + acceso al contribuyente (si no: 404) | `taxpayers.read` | ✅ E2E |
| Editar contribuyente (NIF inmutable) | Server Action | Sesión + acceso FULL | `taxpayers.update` | ✅ `taxpayers.test.ts` |
| Asignar / cambiar / retirar acceso a contribuyente | Server Action | Sesión + acceso FULL propio; nunca a uno mismo | `taxpayers.manage_access` | ✅ `taxpayers.test.ts`, E2E |
| Clientes del contribuyente: listar / dar de alta | Server Component / Server Action | Sesión + acceso al contribuyente (alta: FULL) | `customers.read` / `customers.write` | ✅ `invoices.test.ts`, E2E |
| Productos del contribuyente: listar / dar de alta | Server Component / Server Action | Sesión + acceso al contribuyente (alta: FULL) | `products.read` / `products.write` | ✅ `invoices.test.ts`, E2E |
| Facturas: listar y ver | Server Component | Sesión + acceso al contribuyente | `invoices.read` | ✅ `invoices.test.ts`, E2E |
| Crear / editar / borrar borrador | Server Action | Sesión + acceso FULL | `invoices.draft` (EMPLOYEE incluido) | ✅ `invoices.test.ts`, E2E |
| Emitir factura (número correlativo; inalterable después) | Server Action | Sesión + acceso FULL + confirmación explícita | `invoices.issue` (no EMPLOYEE) | ✅ `invoices.test.ts`, E2E |
| Preparar rectificativa (borrador por diferencias, serie propia) | Server Action | Sesión + acceso FULL + motivo + tipo R1–R4 | `invoices.rectify` | ✅ `invoices.test.ts`, `verifactu.test.ts`, E2E |
| Anular factura expedida por error (registro de anulación VERI*FACTU) | Server Action | Sesión + acceso FULL + motivo + confirmación | `invoices.rectify` (no EMPLOYEE) | ✅ `tenancy/test/verifactu.test.ts`, E2E |
| Ver la cadena de registros VERI*FACTU y su comprobación | Página | Sesión + acceso al contribuyente | `verifactu.read` | ✅ `tenancy/test/verifactu.test.ts`, E2E |
| Subir, sustituir o borrar el certificado electrónico del contribuyente | Server Action | Sesión + acceso FULL | `certificates.manage` (OWNER y ADMIN) | ✅ `tenancy/test/certificates.test.ts`, E2E |
| Aviso de registros pendientes o rechazados por la AEAT | Todas las pantallas del contribuyente | Sesión + acceso al contribuyente | `verifactu.read` | ✅ `tenancy/test/certificates.test.ts` |

Matriz rol → permiso: [roles-and-permissions](../tenancy/roles-and-permissions.md).
