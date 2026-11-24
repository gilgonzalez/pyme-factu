# VERI*FACTU — visión técnica (Fase 0)

> Este documento recoge **solo** lo verificado en fuentes oficiales el 24/11/2026 y el diseño derivado. Nada aquí está implementado. Los formatos exactos (huella, QR, XML) **no** se han implementado ni resumido de memoria: deben leerse íntegros de las especificaciones oficiales en la Fase 5 (⛔ bloqueante).

## 1. Calendario (⛔ situación cambiante)

| Hecho | Fuente | Estado |
|---|---|---|
| Plazo vigente: contribuyentes del Impuesto sobre Sociedades, antes del **1/1/2027**; resto, antes del **1/7/2027** | Nota informativa AEAT (actualizada 13/10/2026), tras el Real Decreto-ley 15/2025, de 2 de diciembre | Vigente |
| Hacienda anuncia el **5/10/2026** una *previsión* de aplazar las obligaciones pendientes del RD 1007/2023 **hasta octubre de 2028**, para alinearlas con la factura electrónica de empresarios con facturación ≤ 8 M€, y una modificación posterior para la «convergencia» técnica con la factura electrónica y ViDA, manteniendo integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad en términos «sustancialmente equivalentes» | Nota de prensa del Ministerio de Hacienda, 05/10/2026 | **Anuncio, no norma**: no se ha localizado publicación en BOE a la fecha de consulta |
| Servicios VERI*FACTU de la AEAT en producción desde el 23/04/2025 | FAQ desarrolladores v1.3 | — |

**Consecuencia de diseño:** no acoplar el dominio a fechas; modalidad y formatos versionados (§3–§5), porque es probable un cambio técnico posterior.

## 2. Identificación del SIF y ámbito del encadenamiento

Verificado en *Aclaraciones a dudas de los desarrolladores*, AEAT, **v1.3 (4/12/2025)**, apartados 3, 4, 6, 7 y 15:

- Un SIF se identifica por **NIF del obligado a expedir (OEF) + IdSistemaInformatico (2 caracteres asignados por el productor) + NúmeroInstalación**. La versión no cambia la identidad.
- El número de instalación **no puede repetirse nunca** entre SIF de un mismo OEF (pasado, presente o futuro); se recomienda *timestamp* o secuencial.
- En un SIF que lleva **varias facturaciones** (distintos OEF, o el mismo OEF con centros independientes), **cada facturación es un «SIF virtual»** con número de instalación propio y encadenamiento independiente. Un SIF «multiOT» cumple los requisitos individualmente para cada obligado.
- SaaS: `IndicadorMultiplesOT` se calcula **por usuario del SIF SaaS**: «S» si ese usuario tiene más de una facturación creada (cualquier estado), «N» si solo una.
- No se permite el uso «dinámico» (cambiar de normativa/modalidad por sesión, día o factura).
- Todos los registros de un mismo envío deben ser del mismo obligado tributario.
- Antes de generar cada registro (salvo el primero) el SIF comprueba que el último registro está correctamente encadenado y que su fecha-hora no supera en más de un minuto a la actual (OM HAC/1177/2024, art. 7.i, citado en el apartado 15).
- Un registro se identifica por Emisor + Serie y número + Fecha de expedición; la AEAT rechaza duplicados. No se puede reutilizar la numeración de facturas emitidas, ni siquiera «de prueba»; los borradores previos a la validación sí son lícitos (y los registros preparatorios que no llegan a factura deben conservarse).
- Debe mostrarse en todo momento qué obligado tributario está activo y advertir si el SIF soporta más de uno (OM art. 2.d, apartado 7).

### Diseño derivado (📄, Fase 5)

```mermaid
erDiagram
  tenants ||--o{ taxpayers : contiene
  taxpayers ||--o{ billing_systems : "facturaciones (SIF virtuales)"
  billing_systems ||--|| record_chains : "una cadena"
  record_chains ||--o{ billing_records : "alta / anulación encadenados"
  billing_records ||--o{ aeat_submissions : remite
```

- **`billing_systems`** = una «facturación»: `(tenant_id, taxpayer_id, installation_number, modality, software_version_id)`. El encadenamiento **no** es por tenant ni global: es por facturación.
- **Unicidad del número de instalación**: como el mismo NIF puede existir en dos tenants, debe ser **global por NIF** (`UNIQUE (issuer_nif, installation_number)` en una tabla de plataforma), no por tenant; monótono y nunca reutilizado.
- **Concurrencia**: la cabeza de cada cadena se bloquea con `SELECT … FOR UPDATE` en la misma transacción que inserta el registro; únicos sobre `(chain_id, sequence)` y `previous_record_id`.
- **Instantáneas**: cada registro guarda los datos usados para la huella; es la fuente de verdad (el PDF no).
- `IndicadorMultiplesOT`: ⛔ falta decidir qué es «usuario del SIF SaaS» en nuestro modelo (¿tenant? ¿persona?) — requiere validación profesional.

## 3. Registros, huella, QR y XML (⛔ pendiente de lectura íntegra)

| Tema | Documento oficial | Estado |
|---|---|---|
| Diseños de registro | AEAT Desarrolladores › «Documento Diseño de registro de facturación» | No leído íntegro |
| Huella (hash) | `Veri-Factu_especificaciones_huella_hash_registros.pdf` | No leído íntegro. Confirmado solo (FAQ): SHA-256 para todos los tipos de registro y la huella de cada registro se incluye en el siguiente |
| Firma electrónica de registros y eventos | Sede › «Especificaciones técnicas de la firma electrónica…» | No leído. La FAQ la asocia a la modalidad NO VERI*FACTU; ⛔ confirmar en la OM si aplica a VERI*FACTU |
| QR y servicio de cotejo | `DetalleEspecificacTecnCodigoQRfactura.pdf` | No leído |
| Servicios web | `Veri-Factu_Descripcion_SWeb.pdf`; WSDL `SistemaFacturacion.wsdl` | No leído; endpoints **no confirmados** |
| Esquemas XSD | `SuministroLR.xsd`, `SuministroInformacion.xsd`, `RespuestaSuministro.xsd`, `ConsultaLR.xsd`, `RespuestaConsultaLR.xsd`, `EventosSIF.xsd`, `RespuestaValRegistNoVeriFactu.xsd` | Listados; no descargados (marcados «Con certificado» en el portal) |
| Validaciones y errores | AEAT Desarrolladores › «Validaciones y errores» | No leído |

URLs en [legal-references](../compliance/legal-references.md). En Fase 5: descargar, versionar (`packages/verifactu/specs/<versión>/` con fecha y SHA-256 del fichero) y construir vectores de prueba desde los ejemplos oficiales.

## 4. VERI*FACTU vs NO VERI*FACTU

| | VERI*FACTU (alcance v1) | NO VERI*FACTU (futuro) |
|---|---|---|
| Remisión | Envío de cada registro a la AEAT | Conservación en el SIF; remisión por requerimiento |
| Registro de eventos | — | Obligatorio (`EventosSIF.xsd`) |
| Mención en factura | QR + «VERI*FACTU» (FAQ de la sede) | ⛔ por confirmar |
| Cambio de modalidad | Opción tácita al iniciar la remisión; se permanece al menos hasta fin del año natural | — |

Diseño: `modality` es atributo de `billing_systems`; las reglas de cada modalidad viven en módulos separados tras una interfaz común (p. ej. `RecordSink`: «remitir» vs «conservar»). Un SIF no intercala modalidades.

## 5. Ciclo de vida de un registro (📄 borrador)

`ISSUED (factura) → RECORD_GENERATED → QUEUED (outbox) → SENT → {ACCEPTED | ACCEPTED_WITH_ERRORS | REJECTED}`; `SENT → NO_RESPONSE → RETRY_SCHEDULED → SENT`.

Son estados **internos**; los oficiales se modelarán tal como figuren en `RespuestaSuministro.xsd` y en el documento de validaciones (⛔). Si no hay respuesta tras un envío, se reenvía hasta obtenerla (FAQ); un reintento transmite **el mismo** registro, nunca uno nuevo. Corrección de errores: nunca se altera un registro; se genera un registro de anulación o de subsanación.
