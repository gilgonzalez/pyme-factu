# Especificaciones oficiales VERI*FACTU (versión 1.0 de los esquemas)

Copias de los documentos oficiales de la AEAT, descargadas el **24/11/2026**. Son la fuente de verdad del paquete. Los tests las usan directamente: los XSD validan el XML generado y los ejemplos del documento de huella son vectores de prueba. No se editan; si la AEAT publica una versión nueva, se añade una carpeta nueva (`specs/<versión>/`) y se revisan los tests.

| Fichero | Documento | Versión / fecha | Origen | SHA-256 |
|---|---|---|---|---|
| `Veri-Factu_especificaciones_huella_hash_registros.pdf` | Detalle de las especificaciones técnicas para generación de la huella o hash | 0.1.2 · 27/08/2024 | agenciatributaria.es › static_files › VERI-FACTU | `f4334c254bb875b417247b54315199f89d75a8c4814dfd1e86efec562653d7de` |
| `DetalleEspecificacTecnCodigoQRfactura.pdf` | Detalle de las especificaciones técnicas del código QR y de la URL del servicio de cotejo | 0.5.0 · 10/12/2025 | ídem | `f86b3c260d8a4963dbc18c5007732b53199156c5d1db63242e68db71501b49eb` |
| `Veri-Factu_Descripcion_SWeb.pdf` | Sistemas Informáticos de Facturación: descripción de los servicios web | 1.0.3 · 28/07/2025 | ídem | `b3570f6a308ce98a5f52001a0dc427310ad6cf7bccd60a9ee98720a59e553c02` |
| `Validaciones_Errores_Veri-Factu.pdf` | Validaciones y errores | 1.2.2 · 08/04/2026 | ídem | `426eb926fc098a36a163f66ca5f40d9e0847ca23300bbe5008979832d3513440` |
| `DsRegistroVeriFactu.xlsx` | Diseño de registro de facturación | — | ídem | `40ce191aa1def6e44a5f1e86d7ece727258745b34e3fe4d6abe1468252dac2ca` |
| `errores.properties` | Listado de códigos de error (Latin-1) | — | prewww2.aeat.es › tikeV1.0/cont/ws | `06519ceb23422bd6b0ad3bfb659e3007615050da4920781d12cff536481d5902` |
| `SuministroLR.xsd` | Esquema del envío (alta y anulación) | 1.0 | prewww2.aeat.es › tikeV1.0/cont/ws | `cbdac8d427cc5ab5d77ca48974cab0f35d6bb819c4c66db361681e3710aeba36` |
| `SuministroInformacion.xsd` | Tipos comunes de los registros | 1.0 | ídem | `ee4c1655175644de44c4c25055ffeb8e5f4bb4bc3834ce8254d4222ef18c8aa1` |
| `RespuestaSuministro.xsd` | Esquema de la respuesta al envío | 1.0 | ídem | `82acf80f785643caac13087aae66808ed721a13f08ca5218cf8ae81b695549ef` |
| `ConsultaLR.xsd` | Consulta de registros presentados | 1.0 | ídem | `bf2cdb8fc4b95b291757a72b76d8fffca06a6d30d9329122ca2fd6b2d5f8f1b1` |
| `RespuestaConsultaLR.xsd` | Respuesta de la consulta | 1.0 | ídem | `de35063acb8d9ba0d6ae51acc6b595de9c2b12333250e95e13108ef5f2670d45` |
| `EventosSIF.xsd` | Registro de eventos (solo NO VERI*FACTU) | 1.0 | ídem | `cc7347c6a9a57a0c8edbc6b9ddcce55176452d0db0e68369477e207e9fbdd7e7` |
| `RespuestaValRegistNoVeriFactu.xsd` | Respuesta a la validación de registros NO VERI*FACTU | 1.0 | ídem | `8f47af4f3c49d29b6a62aed261c09f171e855ad6d6bb72ef3fc0b147dc9572f0` |
| `SistemaFacturacion.wsdl` | Servicios web (endpoints de pruebas y producción) | 1.0 | ídem | `05919120708ff7650612fa6683c9336eaf919335d9a4db10e86759190af48602` |
| `xmldsig-core-schema.xsd` | XML Signature Schema (importado por `SuministroInformacion.xsd`) | W3C | https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd | `d102ad3df7664c307e0c2c776ba4a90513b1969974d8a940bae1a77f9f21e15d` |

Normativa leída para esta versión: Orden HAC/1177/2024, texto consolidado del BOE (BOE-A-2024-22138). Detalle y enlaces en [legal-references](../../../docs/compliance/legal-references.md).

Comprobar las huellas: `sha256sum packages/verifactu/specs/1.0/*`.
