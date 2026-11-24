# ADR-004 — Encadenamiento por «facturación» (SIF virtual), no por tenant

- **Estado:** Propuesta (24/11/2026) — pendiente de leer íntegras las especificaciones (Fase 5)

**Contexto.** La FAQ de desarrolladores de la AEAT (v1.3, apdo. 4) establece que en un SIF que gestiona varias facturaciones (distintos OEF o centros independientes del mismo OEF, incluido SaaS), cada una es un «SIF virtual» con número de instalación propio, nunca repetido para ese OEF, y encadenamiento independiente.

**Problema.** Definir el ámbito de la cadena de registros y la identidad del SIF en una plataforma con varios tenants y varios contribuyentes por tenant, donde un mismo NIF puede aparecer en dos tenants.

**Alternativas.** (1) Cadena global de plataforma — contraria a la FAQ. (2) Cadena por tenant — mezclaría obligados distintos de una gestoría. (3) Cadena por contribuyente — no admite varias facturaciones de un mismo OEF. (4) Cadena por **facturación** (`billing_systems`), con número de instalación único por NIF a nivel de plataforma.

**Decisión.** (4). Modalidad (VERI*FACTU / futura NO VERI*FACTU) fijada por facturación; reglas de cada modalidad en módulos separados.

**Justificación.** Es el modelo descrito por la AEAT; admite gestorías, centros independientes y el mismo NIF en varios tenants.

**Consecuencias.** Tabla de plataforma para garantizar la unicidad del número de instalación por NIF entre tenants. ⛔ Abiertos: interpretación de «usuario del SIF SaaS» para `IndicadorMultiplesOT`; formato exacto del número de instalación; lectura de la OM y del diseño de registros.
