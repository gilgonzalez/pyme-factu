import "server-only";

/**
 * Cookie del modo soporte: el slug de la organización que un administrador de la plataforma consulta en solo
 * lectura. No concede nada por sí misma: el servidor comprueba en la base de datos que quien la lleva es
 * administrador, y PostgreSQL solo deja leer (nunca escribir) esa organización.
 */
export const SUPPORT_COOKIE = "fl-soporte";

/** El soporte caduca a la hora: hay que volver a abrirlo (y queda otra vez en la auditoría). */
export const SUPPORT_MAX_AGE_SECONDS = 60 * 60;
