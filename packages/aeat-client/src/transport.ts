// Transporte del sobre SOAP (descripción de los servicios web v1.0.3, apartado 4.3): HTTPS, SOAP 1.1, UTF-8 y
// autenticación con certificado electrónico cualificado (PKCS#12). El certificado solo vive en memoria.
import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AeatSimulator } from "./simulator";

export interface TransportResult {
  readonly status: number;
  readonly body: string;
}

export type Transport = (envelope: string) => Promise<TransportResult>;

export interface Credentials {
  readonly pfx: Buffer;
  readonly passphrase: string;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** POST al servicio. Solo HTTPS (en la propia máquina se admite HTTP para simuladores y pruebas). */
export function httpTransport(url: string, credentials: Credentials | null, timeoutMs = 60_000): Transport {
  const target = new URL(url);
  const secure = target.protocol === "https:";
  if (!secure && !LOOPBACK.has(target.hostname)) throw new Error("La conexión con la AEAT debe ser HTTPS.");
  return (envelope) =>
    new Promise((resolve, reject) => {
      const options = {
        method: "POST",
        headers: { "content-type": "text/xml; charset=utf-8", soapaction: '""', "content-length": Buffer.byteLength(envelope, "utf8") },
        ...(credentials === null ? {} : { pfx: credentials.pfx, passphrase: credentials.passphrase }),
      };
      const onResponse = (response: IncomingMessage): void => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      };
      const request: ClientRequest = secure ? httpsRequest(target, options, onResponse) : httpRequest(target, options, onResponse);
      request.setTimeout(timeoutMs, () => request.destroy(new Error(`Sin respuesta de la AEAT en ${(timeoutMs / 1000).toLocaleString("es-ES")} s`)));
      request.on("error", reject);
      request.end(envelope, "utf8");
    });
}

/** El simulador local como transporte (desarrollo y pruebas automáticas). */
export const simulatorTransport =
  (simulator: AeatSimulator): Transport =>
  (envelope) =>
    Promise.resolve(simulator.handle(envelope));
