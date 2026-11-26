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
| Desactivar cuenta de usuario | Sin acceso (sesiones cerradas, membresías suspendidas, inicio de sesión bloqueado); se mantienen membresías históricas y autoría en auditoría; no se permite si deja una organización activa sin propietario | ✅ Fase 7 (`app.deactivate_my_account()`; «Mi cuenta»; `account.test.ts`, `auth.test.ts`, E2E) |
| Exportar mis datos personales (RGPD arts. 15 y 20) | JSON con cuenta, organizaciones y rol, sesiones y actividad propia | ✅ Fase 7 (`app.my_personal_data()`; «Mi cuenta › Descargar mis datos»; E2E) |
| Desactivar organización | `tenants.status = DEACTIVATED`; acceso solo de lectura/exportación para OWNER durante el plazo de conservación | 📄 |
| Suprimir datos personales | Solo de datos no sujetos a obligación de conservación (perfil, preferencias, sesiones); seudonimización del usuario en auditoría | 📄 ⛔ |
| Conservar registros fiscales | Facturas y registros de facturación **no** se borran automáticamente; plazo según LGT/RD 1619/2012/RRSIF | ⛔ plazos exactos por confirmar |

## Administración de la plataforma y acceso de soporte

- **Quién administra:** la tabla `platform_admins`, que solo modifica el rol propietario con `pnpm --filter @facturalibre/database admin:grant <email> [--revoke]` (queda en la auditoría). Ningún rol de ejecución puede leerla ni escribirla.
- **Panel (`/plataforma`):** solo metadatos (organizaciones, cuentas, recuentos y estado de los registros VERI*FACTU), mediante funciones `app.admin_*` que exigen ser administrador en la propia base de datos.
- **Suspensiones:** de cuentas (cierra sus sesiones e impide iniciar sesión) y de organizaciones (sus miembros pierden el acceso por RLS; el envío a la AEAT de lo ya registrado continúa). Cada suspensión y reactivación queda auditada con su motivo.
- **Acceso de soporte:** un administrador puede abrir una organización ajena en **solo lectura** para dar soporte. PostgreSQL solo lo permite en transacciones `READ ONLY` (`app.support_tenant_id()`), caduca a la hora y cada apertura queda en la auditoría de esa organización (`platform.support_access`).
- ⛔ **Política de privacidad:** el acceso de soporte a datos de clientes (facturas, clientes) debe figurar en la política de privacidad y en el contrato de encargo del tratamiento (RGPD art. 28), con su finalidad (soporte e incidencias) y sus garantías (solo lectura, registro de cada acceso).

## Pendiente

Registro de actividades de tratamiento, EIPD (evaluar necesidad), política de retención concreta, procedimiento formal de ejercicio de derechos (la exportación y la desactivación de la propia cuenta ya están), supresión de datos personales no sujetos a conservación (⛔ plazos), exportación de datos por tenant, subencargados (hosting, correo), ubicación de los datos (preferencia UE).
