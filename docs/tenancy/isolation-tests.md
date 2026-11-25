# Pruebas de aislamiento (bloqueantes)

Se ejecutan con `pnpm test` contra un **PostgreSQL 18 real** y efímero (embedded-postgres, o `TEST_DATABASE_URL` en CI), con migraciones aplicadas desde cero y datos **ficticios**: Tenant A (`empresa-alfa`: Ana OWNER, Carl EMPLOYEE con acceso de solo lectura a A1, Dani suspendido; contribuyentes A1 y A2) y Tenant B (`gestoria-beta`: Bea OWNER; contribuyente B1).

Resultado a 24/11/2026: **todas en verde** (database 42, tenancy 14).

| Requisito (§4.8 del prompt maestro) | Prueba | Estado |
|---|---|---|
| A no lee datos de B | `rls.test.ts` › «lee solo su tenant, sus contribuyentes y su auditoría» | ✅ |
| A no modifica datos de B | «no modifica datos de Tenant B»; «no mueve un contribuyente propio a Tenant B» | ✅ |
| A no borra datos de B | «no borra membresías de Tenant B» | ✅ |
| Identificadores conocidos (IDOR) | «no lee un contribuyente ajeno aunque conozca su identificador»; `tenant-context.test.ts` › «rechaza un contribuyente de otro tenant» | ✅ |
| Contribuyentes no autorizados | «un miembro con alcance ASSIGNED solo ve sus contribuyentes asignados»; «con acceso READ_ONLY no puede modificar»; «rechaza un contribuyente no asignado al miembro» | ✅ |
| Acciones en nombre de otro tenant | «no inserta membresías en Tenant B»; «no encola trabajos para Tenant B»; «un usuario no puede registrar eventos en nombre de otro» | ✅ |
| Contexto fabricado por error de aplicación | «si la aplicación fijara el tenant de otro… no devuelve nada»; «aunque se fabrique un contexto con el tenant de otro, PostgreSQL no devuelve sus datos» (vía Prisma) | ✅ |
| Conexión reutilizada no conserva contexto | «el contexto de una transacción no sobrevive en la misma conexión» (pg); «la conexión reutilizada del pool no conserva el contexto anterior» (Prisma, pool = 1) | ✅ |
| Worker con contexto incorrecto | «solo audita dentro del tenant fijado en su contexto»; «no tiene acceso a datos de dominio» | ✅ (parcial: aún no procesa trabajos fiscales) |
| Integridad sin RLS | FKs compuestas: «una asignación no puede unir un contribuyente de B con A»; «exige que el usuario sea miembro del mismo tenant»; «solo un OWNER» | ✅ |
| Higiene de roles | sin superusuario ni BYPASSRLS; ninguno propietario; todas las tablas con RLS | ✅ |
| Escalada de privilegios | `authorization.test.ts` › cambios de rol (anti-escalada) | ✅ lógica + `tenancy/test/team.test.ts` (ADMIN no invita ADMIN, nadie cambia su rol ni el de rango ≥) |
| Membresía suspendida | «un miembro SUSPENDIDO no ve nada del tenant»; TENANT_NOT_FOUND | ✅ |
| PDFs de otros tenants | «una factura emitida de otra organización no se lee aunque se conozca su id (tampoco su PDF, que sale de aquí)» (`tenancy/test/invoices.test.ts`). El PDF no se guarda: se genera en cada descarga desde `getInvoice` (RLS) y la ruta responde 404 | ✅ |
| Certificados de otros tenants | Tabla `taxpayer_certificates` con RLS (`rls.test.ts` › todas las tablas con RLS); `certificates.test.ts` › solo quien administra el contribuyente lo gestiona | ✅ |
| Recorridos HTTP completos con sesión | `apps/web/e2e/team.spec.ts` (organización ajena → 404 idéntico; invitación solo para su email) | ✅ |
