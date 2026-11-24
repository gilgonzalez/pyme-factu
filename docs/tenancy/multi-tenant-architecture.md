# Arquitectura multi-tenant

Estado: ✅ modelo, RLS, TenantContext y autorización implementados y probados. ✅ alta de tenant (`app.create_tenant`), invitaciones, gestión de miembros y selector de organización en la UI (Fase 2).

## Conceptos

| Concepto | Tabla | Regla clave |
|---|---|---|
| **User** | `users` | Identidad global; puede pertenecer a varios tenants. |
| **Tenant** | `tenants` | Organización / espacio de trabajo (autónomo, empresa, gestoría). |
| **TenantMembership** | `tenant_memberships` | Rol del usuario en ese tenant + alcance sobre contribuyentes + estado. |
| **Taxpayer** | `taxpayers` | Obligado tributario emisor. Un tenant puede tener varios. |
| **TaxpayerMembership** | `taxpayer_memberships` | Acceso de un miembro a un contribuyente concreto (`READ_ONLY`/`FULL`). Solo cuenta si el alcance del miembro es `ASSIGNED_TAXPAYERS`. |

Pertenecer a un tenant **no** da acceso a todos sus contribuyentes: depende de `taxpayer_scope` (por defecto `ASSIGNED_TAXPAYERS`).

## Estrategia: tres capas

1. **Aplicación** — `resolveTenantContext` + `runInTenant` con permisos granulares.
2. **RLS** — las políticas verifican en BD la membresía activa del usuario del contexto (`app.authorized_tenant_id()`): un `tenant_id` mal fijado por la aplicación no devuelve datos.
3. **Integridad** — FKs compuestas que impiden relacionar filas de tenants distintos incluso sin RLS.

Base de datos y esquema compartidos con discriminador `tenant_id` (+ `taxpayer_id`). Alternativas en [ADR-002](../decisions/ADR-002-multi-tenancy.md).

## TenantContext (`packages/tenancy/src/tenant-context.ts`)

| Campo | Origen |
|---|---|
| `user.id` | Sesión del servidor (Better Auth, `lib/server/session.ts`). Nunca del cliente. |
| `tenant {id, slug, name}` | Membresía ACTIVA del usuario en el slug solicitado |
| `membership {id, role, taxpayerScope}` | Ídem |
| `taxpayer {id, access}` \| `null` | Solo si el usuario puede ver ese contribuyente (RLS) |
| `permissions` | `effectivePermissions(role, access)` — el acceso al contribuyente solo resta |
| `audit.requestId` | Correlación para auditoría |

El tipo lleva una **marca nominal**: fuera de `resolveTenantContext` solo puede construirse con un cast explícito, visible en revisión.

## Rutas

`/{tenantSlug}/…` (p. ej. `/empresa-demo/facturas`). El slug identifica; la membresía autoriza. Preparado para subdominios: la resolución recibe un `tenantSlug` venga de la ruta o del host.

## Administradores de plataforma y soporte

No existe rol de plataforma con acceso a datos de tenants: ningún rol de BD de ejecución tiene `BYPASSRLS` (probado). El acceso excepcional de soporte (📄 diseño, ⏳ implementación) requerirá solicitud justificada, autorización del OWNER, alcance y caducidad limitados, membresía temporal `VIEWER` en lugar de bypass, y auditoría de cada acceso.

## Cambio de organización y de contribuyente

Cada petición resuelve el contexto desde cero ([application-flow](../architecture/application-flow.md)). Cambiar de organización = navegar a otro slug; cambiar de contribuyente = elegir otro `taxpayerId`, que se vuelve a verificar. Una única sesión.
