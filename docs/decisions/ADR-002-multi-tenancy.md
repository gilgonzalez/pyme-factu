# ADR-002 — Multi-tenancy con esquema compartido, RLS y FKs compuestas

- **Estado:** Aceptada (24/11/2026)

**Contexto.** Muchas organizaciones pequeñas (autónomos) y algunas que gestionan varios contribuyentes (gestorías). Producto gratuito: el coste por tenant debe ser mínimo.

**Problema.** Garantizar que ninguna organización accede a datos de otra, incluso ante errores de la aplicación.

**Alternativas.** (1) BD por tenant: aislamiento físico, coste y operación inasumibles para miles de tenants gratuitos. (2) Esquema por tenant: migraciones N veces, límites de catálogo. (3) Esquema compartido con `tenant_id` y filtros solo en la aplicación: un olvido = fuga. (4) Esquema compartido + RLS + FKs compuestas + autorización en servidor.

**Decisión.** (4). Además, las políticas no confían en `app.tenant_id` a ciegas: `app.authorized_tenant_id()` exige membresía ACTIVA del `app.user_id` en BD. El contexto se fija con `set_config(…, true)` (≡ `SET LOCAL`) dentro de la transacción de `runInTenant`. Separación User / Tenant / TenantMembership / Taxpayer / TaxpayerMembership con alcance de contribuyente explícito.

**Justificación.** Defensa en profundidad con coste operativo de una sola BD. Probado: conexión reutilizada sin fuga, contexto fabricado sin datos, FKs que impiden mezclar tenants incluso sin RLS.

**Consecuencias.** Toda consulta a datos de tenant debe ir en una transacción (`runInTenant`). Cada tabla nueva necesita RLS, políticas y GRANTs en su migración (la prueba de catálogo lo vigila). Coste de rendimiento de las funciones de política: `authorized_tenant_id()` se evalúa una vez por consulta (`(SELECT …)`); `can_access_taxpayer` es por fila y se revisará con índices/medición cuando haya volumen (Fase 7).
