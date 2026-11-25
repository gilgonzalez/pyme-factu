// Lectura de XML de la AEAT (respuestas y, en el simulador, peticiones): sin prefijos de espacio de nombres, sin
// atributos, valores como texto recortado (los ceros y decimales se conservan tal cual llegan).
import { XMLParser } from "fast-xml-parser";

export type XmlNode = Readonly<Record<string, unknown>>;

/** Lector que devuelve siempre como lista los elementos indicados (aunque solo aparezca uno). */
export const xmlReader = (repeated: string): XMLParser =>
  new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: true, isArray: (name) => name === repeated });

/** El valor como elemento; cualquier otra cosa (texto, ausente) como elemento vacío. */
export const xmlNode = (value: unknown): XmlNode => (value instanceof Object ? (value as XmlNode) : {});
