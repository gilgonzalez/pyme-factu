# ADR-008 — Registros VERI*FACTU: contenido, huella, cadena y QR

- **Estado:** Aceptada (24/11/2026) para la Fase 5. Lo marcado ⛔ debe confirmarse en el portal de pruebas externas de la AEAT y con un profesional tributario.
- **Fuentes**: documentos oficiales versionados en [`packages/verifactu/specs/1.0`](../../packages/verifactu/specs/README.md):
  - huella v0.1.2;
  - QR v0.5.0;
  - servicios web v1.0.3;
  - validaciones v1.2.2;
  - XSD 1.0.
  
  También la Orden HAC/1177/2024 (texto consolidado del BOE).

## Contexto

Toda factura expedida por un sistema VERI*FACTU genera, en el mismo momento, un **registro de facturación de alta** encadenado con el anterior mediante su huella. Las referencias son el art. 7 y los arts. 10–13 de la OM, y el art. 16 del Reglamento.

Una factura expedida por error se anula con un **registro de anulación**. Ese es el art. 11 de la OM, y la descripción de los servicios web, apdo. 9.2.1, lo reserva para cuando «no ha habido una auténtica venta». El registro de anulación no sustituye a la rectificativa.

La factura incluye un QR que lleva a la AEAT a la URL de cotejo, regulado en los arts. 20 y 21 de la OM.

Que el sistema funcione como VERI*FACTU deja sin aplicar varios artículos de la OM (art. 3):
- la firma electrónica de los registros (arts. 6.c y 6.d);
- el registro de eventos (art. 9);
- las comprobaciones bajo demanda de la cadena (arts. 6.b, 6.e, 7.h, 7.i y 7.j);
- las reglas de conservación del art. 8.

Por eso FacturaLibre solo ofrece la modalidad VERI*FACTU (`TipoUsoPosibleSoloVerifactu = S`).

## Decisiones

1. **Paquete puro `@facturalibre/verifactu`**. Calcula la huella, construye los registros, genera su XML en el orden de los XSD y produce el QR. No accede a la base de datos.

   Cómo se prueba:
   - con los tres ejemplos oficiales del documento de huella;
   - validando el XML contra los XSD oficiales (libxml2 en WebAssembly, sin red);
   - con mutación al 100 %.
2. **Ámbito de la cadena** (ADR-004): **una facturación por contribuyente** (`billing_systems`), con una única cadena de altas y anulaciones (art. 7.c y 7.d de la OM). El **número de instalación** es el UUID de esa facturación, así que nunca se repite para ningún NIF.

   Que un mismo contribuyente tenga varios centros con facturación independiente no se admite todavía.
3. **Generación en la misma transacción que la emisión.** La transacción:
   - bloquea la facturación (`FOR UPDATE`);
   - asigna el siguiente número de secuencia;
   - calcula la huella con la del registro anterior;
   - guarda el XML exacto del registro.

   Si algo falla, la factura tampoco se emite. Los registros son inalterables para todos los roles (trigger). La fecha-hora de generación (`FechaHoraHusoGenRegistro`) se toma del reloj de la base de datos con el huso de `Europe/Madrid` (art. 7.e y 7.g).

   ⛔ Los contribuyentes de Canarias necesitarían `Atlantic/Canary` y además IGIC, que no se admite.
4. **Tipo de factura**:
   - la factura ordinaria es **F1**, la factura completa;
   - las facturas simplificadas (F2, R5) y las de sustitución (F3) no se emiten;
   - la rectificativa la prepara FacturaLibre **por diferencias** (`TipoRectificativa = I`) e identifica la factura rectificada (`FacturasRectificadas`);
   - el usuario elige la clave de la lista oficial L2 al preparar la rectificativa:
     - **R1**: art. 80.1 y 80.2 LIVA y error fundado en derecho;
     - **R2**: art. 80.3, concurso;
     - **R3**: art. 80.4, créditos incobrables;
     - **R4**: resto.
5. **Destinatario**: una factura completa debe identificar al destinatario (validación 13). Un cliente **sin NIF** no puede recibir una factura F1, y el sistema lo avisa al emitir. ⏳ Clientes extranjeros (`IDOtro`).
6. **Desglose**: cada entrada del cálculo de `fiscal-core` es un `DetalleDesglose`:
   - Impuesto 01 (IVA);
   - ClaveRegimen 01, el régimen general;
   - operación **S1** con su `TipoImpositivo` y su recargo de equivalencia si lo hay, o bien **exenta** con su causa.

   Causas admitidas (lista L10):
   - **E1** (art. 20 LIVA);
   - **E4** (arts. 23 y 24);
   - **E6** (otras).

   No se admiten todavía:
   - E2 y E3 (exportaciones), porque exigen la clave de régimen 02 (validación 15.6.1) y no se pueden combinar con la 01 (validación 15.5);
   - E5, porque exige un destinatario con NIF-IVA.

   Las líneas exentas guardadas antes de la Fase 5 no tienen causa: se pueden leer, pero no emitir hasta indicarla.
7. **Totales del registro** (validaciones 16 y 17):
   - `CuotaTotal` es la suma de cuotas y recargos;
   - `ImporteTotal` es la suma de bases, cuotas y recargos.

   **La retención de IRPF no forma parte del ImporteTotal.** Por eso puede no coincidir con el «total a pagar» de la factura.
8. **DescripcionOperacion** (obligatoria, como máximo 500 caracteres): las descripciones distintas de las líneas, unidas con «; » y recortadas a 500.
9. **IndicadorMultiplesOT**: «S» si la organización (tenant) tiene más de un contribuyente, en cualquier estado. La FAQ de desarrolladores v1.3, apdo. 6, lo calcula «por usuario del SIF SaaS». ⛔ Interpretamos «usuario» como la organización; pendiente de validación profesional.
10. **Sistema informático**: los datos del productor salen de la configuración del despliegue (`SIF_PRODUCER_NAME`, `SIF_PRODUCER_NIF`, `SIF_ID`, `SIF_VERSION`), que se valida al arrancar. En producción son obligatorios.
11. **QR**:
    - URL del servicio de cotejo de facturas verificables (`ValidarQR`): la de producción solo con `FACTURALIBRE_ENV=production`, la de pruebas en el resto de entornos;
    - parámetros: NIF, serie y número, fecha DD-MM-AAAA e **importe = ImporteTotal del registro**, con «URL encoding»;
    - nivel de corrección M;
    - en la ficha de la factura va arriba, precedido de «QR tributario:» y seguido de «VERI*FACTU».

    ⛔ El documento del QR no aclara si el importe admite signo negativo, como en las rectificativas por diferencias. Hay que comprobarlo en el portal de pruebas.

## Consecuencias

- Emitir requiere un cliente con NIF y causa en cada línea exenta. La pantalla lo explica antes de emitir.
- Los registros son la fuente de verdad que se remitirá a la AEAT (Fase 6). Se guarda el XML exacto, así que un reintento reenvía el mismo registro.
- No se ofrece la subsanación de registros (`Subsanacion = S`). Si la AEAT rechaza un registro, hay que tratarlo a mano (ver Fase 6).
