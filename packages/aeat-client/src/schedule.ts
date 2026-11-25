// Cuándo enviar (OM HAC/1177/2024, art. 16): control de flujo con el tiempo de espera que devuelve la AEAT
// (60 s inicialmente) o al acumular el máximo de 1.000 registros, y reintento al menos una vez cada hora.

export const MAX_RECORDS_PER_SUBMISSION = 1000;
export const INITIAL_WAIT_SECONDS = 60;
const MAX_RETRY_SECONDS = 3600;

/** Segundos hasta el siguiente envío tras uno respondido. */
export const nextSendDelaySeconds = (waitSeconds: number, pendingRecords: number): number => (pendingRecords >= MAX_RECORDS_PER_SUBMISSION ? 0 : waitSeconds);

/** Segundos hasta reintentar tras `failures` fallos seguidos: 1, 2, 4… minutos, nunca más de 1 hora. */
export const retryDelaySeconds = (failures: number): number => Math.min(INITIAL_WAIT_SECONDS * 2 ** Math.max(failures - 1, 0), MAX_RETRY_SECONDS);
