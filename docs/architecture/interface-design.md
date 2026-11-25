# Diseño de la interfaz

> Estado a 25/11/2026: ✅ estilo «fintech nítido» aplicado a toda la web (`apps/web`), elegido por el usuario tras descartar un primer diseño (talonario con papel de calco) por anticuado. Verificado con capturas de las 19 pantallas en escritorio (1366 px) y móvil (390 px) y con la batería E2E.

## Idea

Una herramienta financiera actual, en la línea de Stripe, Mercury o Linear: fondo blanco, mucho aire, bordes finos, un único color de acento y cifras protagonistas. La factura se muestra como un documento limpio con su QR tributario arriba; todo lo demás queda sobrio.

## Tokens (`apps/web/app/globals.css`)

| Token | Valor | Uso | Contraste |
| --- | --- | --- | --- |
| `--background` / `--card` | `#ffffff` | Zona de trabajo y tarjetas | — |
| `--subtle` | `#f7f7f9` | Lateral, cabeceras de tabla, filas al pasar | — |
| `--foreground` | `#15151c` | Texto | — |
| `--muted-foreground` | `#62626f` | Texto secundario | 6,0:1 (blanco), 5,6:1 (lateral) |
| `--primary` | `#5a3ff2` | Acento único: acciones, enlaces, foco | 6,1:1 |
| `--border` | `#e8e8ee` | Bordes finos de tarjetas y tablas | — |
| `--input` | `#8c8c9a` | Bordes de campos (WCAG 1.4.11) | 3,3:1 |
| `--success-*` | `#e9f8ef` / `#126a3a` / punto `#17b26a` | Emitida, aceptado | 6,1:1 |
| `--warning-*` | `#fef6e7` / `#8a4b05` / punto `#f79009` | Borrador, aceptado con errores | 6,3:1 |
| `--danger-*` | `#fef0ef` / `#b42318` / punto `#f04438` | Anulada, rechazado, errores | 5,9:1 |

Utilidades: `surface` (tarjeta blanca, radio 14 px, borde fino y sombra mínima) y `figures` (cifras tabulares).

## Tipografía

- **Geist** (variable) para todo el texto: grotesca moderna con cifras tabulares. Títulos en *semibold* con interletraje negativo; cifras grandes para los importes.
- **Geist Mono** solo para datos que se comparan carácter a carácter: NIF, números de factura, huellas y CSV.
- Ambas alojadas en el proyecto con `@fontsource-variable/*` (licencia OFL): ninguna petición a terceros, compatible con la CSP.

## Estructura

- **Lateral fijo** (escritorio, 264 px, fondo `--subtle`): marca; selector de la organización activa (inicial, nombre, rol y «Cambiar»); secciones de la organización con icono; «Facturando como» con el contribuyente activo y su NIF (R-05) y sus secciones; abajo, la cuenta y «Acerca de». Es el `<header>` de la página (landmark *banner*).
- **Móvil**: el mismo contenido en filas compactas; las secciones, en tiras desplazables. El pie con «Acerca de» aparece al final de cada pantalla.
- **Facturas**: lo facturado en el mes en curso (sin anuladas) y el número de emitidas y borradores; tabla con estado (punto de color y palabra).
- **Ficha de factura**: documento a la izquierda (QR arriba y centrado, partes, líneas, totales) y columna con el resumen (total grande, cliente, fecha), el registro VERI*FACTU con su estado y, plegadas, rectificar y anular. «Descargar PDF» junto al título.
- **Editor**: tarjeta con franja ámbar de borrador; el total y «Guardar borrador» quedan fijos al pie mientras se edita.

## Reglas

- El color nunca va solo: cada estado lleva su palabra.
- Fechas en formato español (`25/11/2026`, `25 de noviembre de 2026, 16:04`), nunca ISO.
- Textos en frase normal, sin mayúsculas sostenidas ni datos encadenados con «·».
- Foco visible de 2 px en el acento; `prefers-reduced-motion` respetado.
- Los nombres accesibles que usan los E2E («Contribuyente activo», «Organización activa», «Secciones del contribuyente»…) forman parte del contrato de la interfaz.
