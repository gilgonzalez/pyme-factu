// Prevención de redirecciones abiertas: el destino tras iniciar sesión (?volver=) llega del navegador.
// Solo se aceptan rutas internas absolutas ("/algo"); nunca "//host", barras invertidas ni esquemas.

const DEFAULT_RETURN_PATH = "/organizaciones";
/** Empieza por una única "/" seguida de algo que no sea "/", y sin barras invertidas. */
const INTERNAL_PATH = /^\/(?!\/)[^\\]*$/;
/** Algún carácter de control (U+0000–U+001F o U+007F): permitiría inyectar cabeceras o saltos. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeReturnPath(candidate: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  const valid = typeof candidate === "string" && INTERNAL_PATH.test(candidate) && !hasControlCharacter(candidate);
  return valid ? candidate : fallback;
}
