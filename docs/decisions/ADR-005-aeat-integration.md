# ADR-005 — Integración AEAT aislada, asíncrona e idempotente

- **Estado:** Aceptada (25/11/2026), implementada en la Fase 6. Detalle en [integration-architecture](../aeat/integration-architecture.md). ⛔ Pendiente de probar contra el portal de pruebas externas de la AEAT con un certificado real de pruebas.

**Contexto.** La facturación no debe interrumpirse por caídas de la AEAT; sin respuesta, hay que reenviar hasta obtenerla (FAQ de la sede). El envío exige certificado cualificado.

**Problema.** Comunicar registros de forma fiable sin duplicados, sin bloquear al usuario y sin exponer certificados.

**Alternativas.** (1) Envío síncrono en la petición del usuario. (2) Cola en memoria. (3) Outbox en PostgreSQL + worker con intentos persistidos.

**Decisión.** (3). El registro y el evento de outbox se crean en la misma transacción que la emisión; el worker envía lotes de una sola facturación, persiste cada intento, reintenta con espera creciente y límite, y nunca regenera un registro al reintentar. Módulo `aeat-client` independiente; entornos separados por `FACTURALIBRE_ENV` (en desarrollo, simulador local; nunca AEAT real).

**Justificación.** Coherencia transaccional, tolerancia a caídas, trazabilidad completa.

**Consecuencias.** Estados internos distintos de los oficiales (ver [integration-architecture](../aeat/integration-architecture.md)). Implementación final: en lugar de un evento de outbox, la propia tabla `billing_records` hace de cola (estado PENDING + `next_send_at` de su facturación), así el registro es la única fuente de verdad. Endpoints (WSDL 1.0), control de flujo (OM art. 16) y códigos de respuesta leídos de la documentación oficial.
