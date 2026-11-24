# ADR-005 — Integración AEAT aislada, asíncrona e idempotente

- **Estado:** Propuesta (24/11/2026)

**Contexto.** La facturación no debe interrumpirse por caídas de la AEAT; sin respuesta, hay que reenviar hasta obtenerla (FAQ de la sede). El envío exige certificado cualificado.

**Problema.** Comunicar registros de forma fiable sin duplicados, sin bloquear al usuario y sin exponer certificados.

**Alternativas.** (1) Envío síncrono en la petición del usuario. (2) Cola en memoria. (3) Outbox en PostgreSQL + worker con intentos persistidos.

**Decisión.** (3). El registro y el evento de outbox se crean en la misma transacción que la emisión; el worker envía lotes de una sola facturación, persiste cada intento, reintenta con espera creciente y límite, y nunca regenera un registro al reintentar. Módulo `aeat-client` independiente; entornos separados por `FACTURALIBRE_ENV` (en desarrollo, simulador local; nunca AEAT real).

**Justificación.** Coherencia transaccional, tolerancia a caídas, trazabilidad completa.

**Consecuencias.** Estados internos distintos de los oficiales (ver [integration-architecture](../aeat/integration-architecture.md)). ⛔ Endpoints, control de flujo y códigos de respuesta por leer en la documentación oficial.
