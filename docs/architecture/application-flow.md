# Flujo de una petición autenticada

Estado: ✅ pasos 3–7 implementados y probados (`packages/tenancy`, `packages/database`). ✅ pasos 1–2 (autenticación con Better Auth, Fase 2).

```mermaid
sequenceDiagram
  autonumber
  participant B as Navegador
  participant N as Next.js (Server Action / RSC)
  participant A as Auth (Better Auth)
  participant T as tenancy.resolveTenantContext
  participant S as security
  participant P as PostgreSQL (RLS)
  B->>N: /{tenantSlug}/... (+ contribuyente activo elegido)
  N->>A: validar sesión (cookie httpOnly)
  A-->>N: userId (de la sesión, no del cliente)
  N->>T: userId + tenantSlug + taxpayerId (NO confiables)
  T->>P: tx con app.user_id → membresía ACTIVA del usuario en ese slug
  P-->>T: membresía (o nada si no es miembro)
  T->>P: tx con app.tenant_id → ¿acceso al contribuyente?
  T->>S: effectivePermissions(rol, acceso)
  T-->>N: TenantContext (o TENANT_NOT_FOUND / TAXPAYER_NOT_FOUND)
  N->>N: runInTenant(ctx, "permiso.requerido", trabajo)
  N->>P: BEGIN; set_config(app.user_id/tenant_id/taxpayer_id, local); trabajo; COMMIT
  P-->>N: solo filas permitidas por RLS
```

## Garantías

1. **El slug no autoriza**: solo identifica. La autorización es la membresía activa verificada en BD.
2. **Respuesta indistinguible**: tenant inexistente, ajeno o con membresía suspendida → `TENANT_NOT_FOUND` (evita enumeración).
3. **Identificadores del navegador**: `tenantSlug` y `taxpayerId` se validan por formato y se comprueban contra BD; nunca se aceptan `tenant_id` ni roles del cliente.
4. **Doble barrera**: `runInTenant` comprueba el permiso antes de abrir la transacción; aunque un fallo de aplicación fijara otro tenant, `app.authorized_tenant_id()` exige membresía activa del `app.user_id` y PostgreSQL devuelve cero filas (probado).
5. **Contexto efímero**: `set_config(..., true)` ≡ `SET LOCAL`; desaparece al terminar la transacción. Probado con un pool de **una** conexión.
6. **Cambio de organización**: es solo navegar a otro slug; el contexto se resuelve de nuevo en cada petición. No hay estado de "tenant activo" en sesión que pueda quedar desincronizado. (Recordar el último tenant usado como preferencia de navegación: ⏳ pendiente; hoy el selector es `/organizaciones`.)
