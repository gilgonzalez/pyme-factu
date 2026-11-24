# Documentación de FacturaLibre

Estado a **24/11/2026** (fin de Fase 4: facturación — clientes, productos, borradores, emisión con numeración correlativa y rectificativas). Leyenda usada en todos los documentos:

| Etiqueta | Significado |
|---|---|
| ✅ **Implementado** | Existe en el código y tiene pruebas automáticas que pasan. |
| 📄 **Documentado** | Diseño decidido y escrito; sin código todavía. |
| 🧩 **Preparado** | Existe estructura (tablas, módulos, configuración) pero no la funcionalidad. |
| ⏳ **Pendiente** | Fase posterior, sin diseño cerrado. |
| ⛔ **Bloqueado** | Depende de información externa (normativa, AEAT, revisión jurídica). |

## Índice

| Área | Documento |
|---|---|
| Arquitectura | [overview](architecture/overview.md) · [application-flow](architecture/application-flow.md) · [technology-decisions](architecture/technology-decisions.md) |
| Base de datos | [data-model](database/data-model.md) · [migrations](database/migrations.md) |
| Multi-tenancy | [multi-tenant-architecture](tenancy/multi-tenant-architecture.md) · [roles-and-permissions](tenancy/roles-and-permissions.md) · [rls-policies](tenancy/rls-policies.md) · [isolation-tests](tenancy/isolation-tests.md) |
| VERI*FACTU | [technical-overview](verifactu/technical-overview.md) |
| AEAT | [integration-architecture](aeat/integration-architecture.md) |
| Seguridad | [security-architecture](security/security-architecture.md) |
| Cumplimiento | [legal-references](compliance/legal-references.md) · [regulatory-requirements](compliance/regulatory-requirements.md) · [data-protection](compliance/data-protection.md) · [producer-declaration](compliance/producer-declaration.md) |
| Despliegue | [local-development](deployment/local-development.md) · [docker](deployment/docker.md) |
| API | [authorization-matrix](api/authorization-matrix.md) |
| Decisiones | [ADR-001](decisions/ADR-001-architecture.md) · [ADR-002](decisions/ADR-002-multi-tenancy.md) · [ADR-003](decisions/ADR-003-database.md) · [ADR-004](decisions/ADR-004-verifactu.md) · [ADR-005](decisions/ADR-005-aeat-integration.md) · [ADR-006](decisions/ADR-006-authentication.md) · [ADR-007](decisions/ADR-007-invoice-calculation.md) |

## Adaptaciones respecto a la estructura propuesta

La estructura del prompt maestro se ha adaptado (lo permiten sus §5 y §17) para **no crear documentos ni paquetes vacíos**:

- Documentos muy relacionados se han fusionado: `entity-relationships` y `tenant-constraints` dentro de `data-model.md`; `threat-model`, `authentication`, `authorization`, `secrets-management` y `audit` dentro de `security-architecture.md`; los de AEAT en `integration-architecture.md`; `hashing-and-chaining`, `qr-generation`, `xml-structure`, `record-lifecycle` y `compliance-mapping` dentro de `verifactu/technical-overview.md` y `compliance/regulatory-requirements.md`. Se separarán cuando su contenido crezca (fases 5 y 6).
- Las pruebas viven junto a cada paquete (`packages/*/test`, `apps/*/test`, `apps/web/e2e`) en lugar de un `tests/` raíz: Turborepo cachea por paquete y cada paquete declara su propio entorno de pruebas.
- Solo existen los paquetes con código real: `database`, `security`, `tenancy`, `auth` (Fase 2: identidad con Better Auth, plantillas de correo y mailer SMTP; hace las veces del `email` previsto hasta que haya más correos) `domain` (Fase 3: validación del NIF) y `fiscal-core` (Fase 4: cálculo de facturas). Los demás (`verifactu`, `aeat-client`, `pdf`, `email`, `audit`, `ui`) se crearán en su fase. Los componentes shadcn viven en `apps/web/components/ui` hasta que haya un segundo consumidor.
