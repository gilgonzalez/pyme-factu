# Matriz de autorización de endpoints

Toda operación sobre datos de un tenant se ejecuta con `runInTenant(db, ctx, <permiso>, …)`. Esta tabla crece con cada Server Action / Route Handler.

| Endpoint / acción | Método | Autenticación | Permiso | Estado |
|---|---|---|---|---|
| `/` | GET | Pública | — | ✅ |
| `/api/health` | GET | Pública (solo `SELECT 1`, sin datos de tenants) | — | ✅ |
| Worker `:8081/health` | GET | Red interna | — | ✅ |
| Listar mis organizaciones | Server Action | Sesión | (propias membresías, RLS) | 📄 Fase 2 |
| Crear organización | Server Action | Sesión | — (función SQL `SECURITY DEFINER` de alta) | 📄 Fase 2 |
| Invitar miembro | Server Action | Sesión | `members.invite` + `decideRoleChange` | 📄 Fase 2 |
| Cambiar rol | Server Action | Sesión | `members.update_role` + `decideRoleChange` | 📄 Fase 2 |
| Transferir propiedad | Server Action | Sesión + reautenticación | `tenant.transfer_ownership` | 📄 Fase 2 |
| Crear contribuyente | Server Action | Sesión | `taxpayers.create` | 📄 Fase 2 |
| Asignar acceso a contribuyente | Server Action | Sesión | `taxpayers.manage_access` | 📄 Fase 2 |

Matriz rol → permiso: [roles-and-permissions](../tenancy/roles-and-permissions.md).
