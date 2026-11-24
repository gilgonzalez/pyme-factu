# Protección de datos y conservación

> FacturaLibre **no garantiza por sí sola** el cumplimiento del RGPD/LOPDGDD. Este documento recoge decisiones técnicas y los puntos que requieren revisión jurídica (⛔).

## Roles (⛔ revisión jurídica)

- Respecto de los datos de facturación de cada organización (clientes, facturas), la organización usuaria es, previsiblemente, **responsable** y FacturaLibre **encargado** del tratamiento → hará falta un contrato de encargo (art. 28 RGPD) aceptado en el alta del tenant.
- Respecto de las cuentas de usuario (identidad, sesiones, seguridad), FacturaLibre es, previsiblemente, **responsable**.

## Medidas técnicas implementadas (✅)

- Aislamiento por tenant en base de datos (RLS + FKs compuestas), probado.
- Mínimo privilegio en BD: roles separados para web, autenticación y worker; el de aplicación no puede leer sesiones ni hashes de contraseña.
- Auditoría append-only.
- Sin datos reales en pruebas (datos ficticios explícitos, dominio `example.test`).
- Secretos fuera del repositorio (`.env` ignorado; `.dockerignore` excluye `.env` y certificados).

## Desactivar ≠ suprimir ≠ conservar

| Acción | Efecto | Estado |
|---|---|---|
| Desactivar cuenta de usuario | Sin acceso; se mantienen membresías históricas y autoría en auditoría | ⏳ Pendiente (Fase 7, junto con la exportación y supresión de datos personales) |
| Desactivar organización | `tenants.status = DEACTIVATED`; acceso solo de lectura/exportación para OWNER durante el plazo de conservación | 📄 |
| Suprimir datos personales | Solo de datos no sujetos a obligación de conservación (perfil, preferencias, sesiones); seudonimización del usuario en auditoría | 📄 ⛔ |
| Conservar registros fiscales | Facturas y registros de facturación **no** se borran automáticamente; plazo según LGT/RD 1619/2012/RRSIF | ⛔ plazos exactos por confirmar |

## Pendiente

Registro de actividades de tratamiento, EIPD (evaluar necesidad), política de retención concreta, procedimiento de ejercicio de derechos, exportación de datos por tenant, subencargados (hosting, correo), ubicación de los datos (preferencia UE).
