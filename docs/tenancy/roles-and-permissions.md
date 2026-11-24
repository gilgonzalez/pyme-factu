# Roles y permisos

Estado: ✅ implementado en `packages/security` (16 pruebas, mutación 92,7 %).

## Principios

- El código de aplicación **solo** pregunta por permisos (`context.permissions.has("invoices.issue")`), nunca por nombres de rol.
- Permisos efectivos = permisos del rol ∩ lo que permite el acceso al contribuyente activo (`FULL`, `READ_ONLY`, `NONE`). El acceso solo puede **restar**.
- Anti-escalada (`decideRoleChange`): nadie cambia su propio rol; OWNER nunca se asigna (solo transferencia); solo se actúa sobre roles estrictamente inferiores al propio y se asignan roles estrictamente inferiores.

## Catálogo de permisos

| Ámbito | Permisos |
|---|---|
| Organización | `tenant.read`, `tenant.update`, `tenant.deactivate`, `tenant.transfer_ownership`, `members.read`, `members.invite`, `members.update_role`, `members.remove`, `taxpayers.read`, `taxpayers.create`, `taxpayers.manage_access`, `settings.read`, `settings.update`, `audit.read` |
| Contribuyente (lectura) | `customers.read`, `products.read`, `invoices.read`, `verifactu.read`, `reports.read` |
| Contribuyente (escritura) | `taxpayers.update`, `customers.write`, `products.write`, `invoices.draft`, `invoices.issue`, `invoices.rectify`, `certificates.manage` |

## Matriz rol → permisos

| Permiso | OWNER | ADMIN | ACCOUNTANT | EMPLOYEE | VIEWER |
|---|:-:|:-:|:-:|:-:|:-:|
| tenant.read | ✔ | ✔ | ✔ | ✔ | ✔ |
| tenant.update / settings.update | ✔ | ✔ | | | |
| tenant.deactivate / tenant.transfer_ownership | ✔ | | | | |
| members.read | ✔ | ✔ | ✔ | | |
| members.invite / update_role / remove | ✔ | ✔ | | | |
| taxpayers.read | ✔ | ✔ | ✔ | ✔ | ✔ |
| taxpayers.create / manage_access / update | ✔ | ✔ | | | |
| settings.read | ✔ | ✔ | ✔ | | |
| audit.read | ✔ | ✔ | | | |
| customers.read / products.read / invoices.read / verifactu.read | ✔ | ✔ | ✔ | ✔ | ✔ |
| reports.read | ✔ | ✔ | ✔ | | ✔ |
| customers.write | ✔ | ✔ | ✔ | ✔ | |
| products.write | ✔ | ✔ | ✔ | | |
| invoices.draft | ✔ | ✔ | ✔ | ✔ | |
| invoices.issue / invoices.rectify | ✔ | ✔ | ✔ | | |
| certificates.manage | ✔ | ✔ | | | |

## Transferencia de propiedad (✅ `transferOwnership`, `team.test.ts`)

Solo el OWNER; el destinatario debe ser miembro ACTIVO; reautenticación reciente; en una transacción: el OWNER actual pasa a ADMIN y el destinatario a OWNER (el índice único parcial garantiza un único OWNER); evento de auditoría `tenant.ownership_transferred`; notificación a ambos.
