// Direcciones, municipios y provincias con la capitalización habitual en español: mayúscula inicial en cada
// palabra salvo las partículas («de», «la», «del», «y»…), que van en minúscula excepto al principio.

const PARTICLES: ReadonlySet<string> = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al", "o", "u"]);

/** Mayúscula inicial en cada tramo separado por guion, apóstrofo o barra («vitoria-gasteiz», «l'hospitalet»). */
const capitalizeWord = (word: string): string =>
  word.replace(/(^|[-'’/])(\p{L})/gu, (_match, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("es")}`);

/** "calle de la paz 3" → "Calle de la Paz 3". Normaliza espacios. */
export function capitalizeAddress(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es");
      return index > 0 && PARTICLES.has(lower) ? lower : capitalizeWord(lower);
    })
    .join(" ");
}
