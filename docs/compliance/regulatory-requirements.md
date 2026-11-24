# Matriz inicial de requisitos normativos y técnicos

Estados: ✅ implementado y probado · 📄 diseñado · ⏳ pendiente · ⛔ pendiente de validación / fuente por leer.

| ID | Requisito | Fuente oficial | Versión / fecha | Módulo | Implementación | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| R-01 | Plazos de adaptación (IS 1/1/2027; resto 1/7/2027); posible aplazamiento a oct-2028 | Nota AEAT; RDL 15/2025; nota Hacienda | 13/10/2026; 05/10/2026 | Producto | Seguimiento | — | ⛔ vigilar BOE |
| R-02 | Encadenamiento independiente por cada facturación (OEF) en SIF multi-OT/SaaS | FAQ desarrolladores apdo. 4 | v1.3 04/12/2025 | verifactu | `billing_systems` + cadena por facturación | — | 📄 |
| R-03 | Identificación SIF = NIF OEF + IdSIF + NºInstalación; nº instalación nunca repetido para el OEF | FAQ apdo. 4; OM HAC/1177/2024 anexo | v1.3 | verifactu | Unicidad global por NIF | — | 📄 |
| R-04 | `IndicadorMultiplesOT` calculado por usuario del SIF SaaS | FAQ apdo. 4 | v1.3 | verifactu | — | — | ⛔ definir «usuario» |
| R-05 | Mostrar en todo momento el obligado tributario activo; avisar si hay varios | OM art. 2.d (vía FAQ apdo. 7) | — | web | Organización activa siempre visible; barra «Contribuyente activo» en toda pantalla que actúa sobre uno; aviso en Contribuyentes si hay varios | `e2e/taxpayers.spec.ts` | ✅ Fase 3 (las pantallas de facturación de la Fase 4 deben usar la misma barra) |
| R-06 | Prohibido el uso «dinámico» de modalidad/normativa | FAQ apdo. 3 | v1.3 | verifactu | `modality` fija por facturación | — | 📄 |
| R-07 | Comprobar encadenamiento del último registro y desfase ≤ 1 min antes de generar | OM art. 7.i (vía FAQ apdo. 15) | — | verifactu | — | — | 📄 ⛔ leer OM |
| R-08 | Huella SHA-256 encadenada | FAQ sede (huella); especificación de huella | — | verifactu | — | — | ⛔ leer especificación |
| R-09 | QR + mención «VERI*FACTU» en la factura | FAQ sede; especificación QR | — | pdf / verifactu | — | — | ⛔ leer especificación |
| R-10 | Prohibida la numeración duplicada (también facturas «de prueba»); borradores lícitos | FAQ apdo. 6 | v1.3 | fiscal-core | Numeración transaccional; borradores sin número | — | 📄 Fase 4 |
| R-11 | Registros inalterables; corrección mediante anulación/subsanación | FAQ sede (alta/anulación); RRSIF | 21/10/2026 | verifactu | Sin UPDATE/DELETE en tablas fiscales | — | 📄 |
| R-12 | Mismo obligado tributario en cada envío (lote) | FAQ sede | 21/10/2026 | aeat-client | Lote por facturación | — | 📄 |
| R-13 | Reenvío hasta obtener respuesta; la facturación no se interrumpe por caídas | FAQ sede | 21/10/2026 | worker | Outbox + reintentos acotados por intento, persistentes | — | 📄 |
| R-14 | Declaración responsable visible dentro del SIF, por versión | RRSIF art. 13; OM art. 15 (vía FAQ) | — | web / compliance | Ver [producer-declaration](producer-declaration.md) | — | 📄 ⛔ |
| R-15 | Conservación de registros fiscales (no borrado automático) | RRSIF; LGT; RD 1619/2012 | — | database | RESTRICT, sin DELETE de contribuyentes | `rls.test.ts` (GRANTs) | 🧩 |
| R-16 | Aislamiento entre organizaciones | Requisito de producto / RGPD art. 32 | — | tenancy / database | RLS + FKs compuestas + TenantContext | `rls.test.ts`, `tenant-context.test.ts` | ✅ |
| R-17 | Trazabilidad de operaciones (auditoría inalterable) | Requisito de producto | — | database | `audit_events` append-only | `rls.test.ts` › auditoría | ✅ (eventos de negocio de equipo: `team.test.ts`) |
| R-18 | Certificado cualificado para remitir; admite certificado de representante/colaborador social | FAQ sede | 21/10/2026 | aeat-client | — | — | 📄 Fase 6 |
| R-19 | Nunca enviar registros reales desde desarrollo/pruebas | Requisito de producto | — | aeat-client | `FACTURALIBRE_ENV` | — | 📄 Fase 6 |
| R-20 | Formatos XML conforme a XSD oficiales versionados | Esquemas AEAT | — | verifactu | — | — | ⛔ descargar esquemas |
