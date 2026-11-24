# ADR-007 — Cálculo de importes, redondeo, numeración y rectificativas

- **Estado:** Aceptada (24/11/2026) para la Fase 4. ⛔ Pendiente de contrastar con las especificaciones técnicas VERI*FACTU (tolerancias de `ImporteTotal`/`CuotaTotal`) en la Fase 5.
- **Relación:** amplía [ADR-004](ADR-004-verifactu.md) en lo relativo a cálculo y numeración.

## Contexto

Una factura debe expresar base imponible, tipo y cuota (Ley 37/1992 del IVA, art. 90: la cuota resulta de aplicar el tipo a la base; RD 1619/2012, art. 6). Ninguna norma fija expresamente el método de redondeo de la cuota.

## Decisión

1. **Aritmética exacta** con enteros (`bigint`) a escala fija: cantidades con 3 decimales, precios unitarios con 4, porcentajes con 2, importes en céntimos. Nunca coma flotante (`packages/fiscal-core`).
2. **Base de cada línea** = cantidad × precio × (1 − descuento), redondeada al céntimo.
3. **Cuotas de IVA y de recargo de equivalencia sobre la base acumulada de cada tipo**, no línea a línea. El TEAC (resolución de 26/11/2024) avaló el redondeo global frente al redondeo por producto cuando este provoca descuadres, y advirtió que el redondeo no puede rebajar la cuota que resulta de aplicar el tipo a la base.
4. **Redondeo «mitad hacia arriba» simétrico** (−0,005 → −0,01), para que una rectificación por diferencias sea el negativo exacto del original.
5. **Retención de IRPF** sobre la base total de la factura.
6. **Tipos admitidos:** IVA 21 %, 10 %, 4 %, 0 % y operación exenta. Recargo de equivalencia 5,2 %, 1,4 % y 0,5 % respectivamente. La causa de exención (códigos VERI*FACTU) se añadirá en la Fase 5.
7. **Numeración:** correlativa por serie y contribuyente, asignada solo al **emitir** y en la misma transacción (bloqueo de la fila de la serie). Los borradores no tienen número (FAQ VERI*FACTU apdo. 6: prohibida la numeración duplicada, borradores lícitos). Una factura emitida no se modifica; se corrige con una rectificativa.
8. **Rectificativas** en **serie específica**, separada de la ordinaria (RD 1619/2012, art. 6.1.a, según el texto consolidado citado por la AEAT). Hacen constar su condición de rectificativa y la identificación de la factura rectificada. Los importes se consignan **por diferencias** (positivos o negativos), que es una de las dos formas que admite la AEAT: «indicando directamente el importe de la rectificación […] o bien tal y como queden tras la rectificación efectuada».

## Fuentes

- AEAT, Manual práctico de IVA 2026, «Facturas de rectificación» (actualizada el 30/09/2026): https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2026/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-rectificacion.html
- RD 1619/2012 (texto consolidado): https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696
- Resumen de la resolución del TEAC de 26/11/2024 sobre redondeo: https://primeralecturaediciones.com/?p=20244099 (⛔ localizar el texto oficial en DYCTEA)

## Consecuencias

- Los importes se guardan en céntimos (`BIGINT`) y las cantidades y precios como enteros escalados; la base de datos nunca recalcula.
- La sustitución de facturas simplificadas y la rectificación de varias facturas en un documento quedan fuera de esta fase (⏳).
