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
| Escalada de privilegios | `authorization.test.ts` › cambios de rol (anti-escalada) | ✅ (lógica; el flujo HTTP en Fase 2) |
| Membresía suspendida | «un miembro SUSPENDIDO no ve nada del tenant»; TENANT_NOT_FOUND | ✅ |
| PDFs y certificados de otros tenants | — | ⏳ Fases 4 y 6 (aún no existen esas tablas) |
| Recorridos HTTP completos con sesión | — | ⏳ Fase 2 (E2E con autenticación) |
