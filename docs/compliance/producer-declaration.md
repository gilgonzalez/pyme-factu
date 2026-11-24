# Declaración responsable del productor

> FacturaLibre **no está homologado ni certificado** por la AEAT. El régimen es de **declaración responsable** del productor; no existe homologación previa. No se generará ninguna declaración con afirmaciones no verificadas.

## Lo verificado (FAQ de la sede, 21/10/2026; RRSIF art. 13; OM art. 15)

- Corresponde al productor certificar, mediante declaración responsable, que el SIF cumple el RRSIF y la OM.
- Debe constar por escrito y de modo **visible en el propio sistema, en cada versión**, accesible para el cliente (p. ej. menú «Acerca de») y disponible también fuera del sistema (texto o PDF).
- **Cada versión es un producto distinto** a estos efectos: la declaración se vincula a una versión concreta.
- No se exige firma electrónica del productor.
- Declarar como conforme un sistema que no lo es es sancionable (FAQ desarrolladores apdo. 3).
- Contenido mínimo según la FAQ: datos que identifiquen el sistema y datos identificativos y de localización del productor, fecha y lugar. ⛔ La lista completa del art. 15.1 de la OM **no** se ha leído todavía.

## Preparación técnica (📄)

- Tabla futura `software_versions` (versión semántica, `IdSistemaInformatico`, fecha de publicación, hash del artefacto) referenciada desde cada `billing_system` y cada registro.
- La declaración se redacta **a mano** por versión, en `docs/compliance/declarations/<versión>.md`, con: identificación del productor, del producto y versión, funcionalidades, modalidad (VERI*FACTU), requisitos aplicables, evidencias (resultados de pruebas de esa versión), limitaciones conocidas.
- La UI la mostrará en «Acerca de» leyendo el fichero de la versión desplegada.

## Bloqueos

⛔ Identificación legal del productor (persona/entidad, NIF, domicilio) — dato que debes proporcionar. ⛔ Revisión jurídica y técnica final antes de cualquier declaración. ⛔ Lectura de la OM art. 15 y de los ejemplos oficiales (v0.5.1).
