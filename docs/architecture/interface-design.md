# Diseño de la interfaz

> Estado a 25/11/2026: ✅ aplicado a toda la web (`apps/web`). Verificado con capturas de las 19 pantallas en escritorio (1366 px) y móvil (390 px) y con la batería E2E.

## Idea

FacturaLibre se inspira en el **talonario de facturas con papel de calco**: el objeto que muchos autónomos han usado durante años. La metáfora no decora; da significado:

| Elemento del talonario | En la interfaz |
| --- | --- |
| La mesa | Fondo gris azulado (`--background`) |
| La hoja (el original, blanco) | Superficies de trabajo (`sheet`) y factura emitida |
| La copia amarilla | **Borrador**: editor y estado «Borrador» |
| La copia rosa | **Anulada** y avisos de error |
| La matriz y su línea perforada | Columna con número, fecha y total de cada factura (ficha y portada) |
| Tinta de bolígrafo | Azul de acciones y enlaces (`--primary`) |

El color nunca va solo: cada estado lleva su palabra («Borrador», «Emitida», «Anulada», «Aceptado», «Rechazado»).

## Tokens (`apps/web/app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--background` | `#e9ecf1` | Mesa |
| `--card` | `#ffffff` | Papel |
| `--foreground` | `#1b2140` | Tinta del texto |
| `--primary` | `#2a3bb7` | Acciones, enlaces, foco |
| `--muted-foreground` | `#565c78` | Texto secundario (≥ 4,5:1 sobre papel y mesa) |
| `--input` | `#858da3` | Bordes de campos (≥ 3:1, WCAG 1.4.11) |
| `--copy-yellow` / `--copy-yellow-ink` | `#fff1a8` / `#5c4700` | Borrador |
| `--copy-pink` / `--copy-pink-ink` | `#f9d5dd` / `#8f1033` | Anulada, rechazos, errores |
| `--ok` / `--ok-ink` | `#dcf1e2` / `#1a6236` | Aceptado, confirmaciones |

Utilidades propias: `sheet` (hoja con sombra), `perforation` / `perforation-x` (línea perforada vertical / horizontal), `figures` (cifras tabulares).

## Tipografía

- **Atkinson Hyperlegible Next** (variable) para todo el texto. Diseñada por el Braille Institute para distinguir caracteres que se confunden (0/O, 1/l/I, 5/S): en una app de NIF e importes es una decisión funcional.
- **Atkinson Hyperlegible Mono** solo para datos que se copian o se comparan carácter a carácter: NIF, números de factura, huellas y CSV.
- Ambas alojadas en el proyecto con `@fontsource-variable/*` (licencia OFL): ninguna petición a terceros, compatible con la CSP.
- Escala 1,25: 16 → 20 → 25 → 31 px (títulos de página) y 39–61 px solo en la portada.

## Estructura

- **Cabecera**: marca, organización activa (con rol y «Cambiar»), secciones de la organización y cuenta. En móvil: marca y cuenta; debajo, organización; debajo, secciones desplazables.
- **Pantallas de un contribuyente**: lateral con «Facturando como» (nombre y NIF; R-05) y sus secciones; en móvil, tarjeta y tira desplazable.
- **Ficha de factura**: la hoja del talonario (matriz | perforación | factura con el QR arriba y centrado), «Descargar PDF» junto al título y, debajo, el registro VERI*FACTU. Rectificar y anular, acciones raras e irreversibles, van **plegadas** (`<details>`) para no competir con lo habitual.
- **Editor**: hoja con la franja amarilla de borrador; el total y «Guardar borrador» quedan fijos al pie mientras se edita.
- **Listados** (facturas, clientes, productos, registros): una sola hoja con filas, a modo de libro registro; el estado de cada factura y de cada remisión con su color.
- **Pie**: «Acerca de» (declaración responsable, art. 15.3 de la OM HAC/1177/2024) accesible desde cualquier pantalla.

## Reglas

- Fechas en formato español (`25/11/2026`, `25 de noviembre de 2026, 16:04`), nunca ISO.
- Textos en frase normal: sin mayúsculas sostenidas en etiquetas ni datos encadenados con «·».
- Controles de al menos 40 px de alto; foco visible de 3 px en tinta azul; `prefers-reduced-motion` respetado.
- Los nombres accesibles que usan los E2E («Contribuyente activo», «Organización activa», «Secciones del contribuyente»…) forman parte del contrato de la interfaz.
