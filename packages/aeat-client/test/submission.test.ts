// Envío: transporte HTTP(S) con certificado cliente, clasificación del resultado (descripción de los servicios web
// v1.0.3, apartado 5.1: Fault de servidor → reenviar; Fault de cliente → corregir antes) y estado de cada registro.
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createSimulator } from "../src/simulator";
import { recordStatus, submit } from "../src/submission";
import { httpTransport, simulatorTransport, type Transport } from "../src/transport";

let server: Server | undefined;
afterEach(async () => {
  await new Promise((resolve) => {
    if (server === undefined) resolve(undefined);
    else server.close(resolve);
  });
  server = undefined;
});

/** Servidor local que responde siempre `status` y `body`, y guarda lo recibido. */
interface Received {
  method?: string | undefined;
  headers?: IncomingHttpHeaders;
  body?: string;
}

async function fakeAeat(status: number, body: string, delayMs = 0): Promise<{ url: string; received: Received }> {
  const received: Received = {};
  server = createServer((request, response) => {
    let data = "";
    request.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    request.on("end", () => {
      received.method = request.method;
      received.headers = request.headers;
      received.body = data;
      setTimeout(() => response.writeHead(status, { "content-type": "text/xml" }).end(body), delayMs);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${String(port)}/ws`, received };
}

const FAULT = (code: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>${code}</faultcode><faultstring>Motivo</faultstring></s:Fault></s:Body></s:Envelope>`;
const RESPONSE = `<s:Envelope xmlns:s="x"><s:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y"><r:TiempoEsperaEnvio>90</r:TiempoEsperaEnvio><r:EstadoEnvio>Correcto</r:EstadoEnvio></r:RespuestaRegFactuSistemaFacturacion></s:Body></s:Envelope>`;

describe("transporte", () => {
  it("POST del sobre SOAP en UTF-8 con SOAPAction vacío (WSDL: soapAction=\"\")", async () => {
    const aeat = await fakeAeat(200, RESPONSE);
    const result = await httpTransport(aeat.url, null)("<envío>ñ</envío>");
    expect(result).toEqual({ status: 200, body: RESPONSE });
    expect(aeat.received.method).toBe("POST");
    expect(aeat.received.body).toBe("<envío>ñ</envío>");
    expect(aeat.received.headers?.["content-type"]).toBe("text/xml; charset=utf-8");
    expect(aeat.received.headers?.["soapaction"]).toBe('""');
  });

  it("sin respuesta en el tiempo máximo, falla (y se reintentará)", async () => {
    const aeat = await fakeAeat(200, RESPONSE, 300);
    await expect(httpTransport(aeat.url, null, 50)("<x/>")).rejects.toThrow("Sin respuesta de la AEAT en 0,05 s");
  });

  it("solo HTTPS, salvo la propia máquina (simulador o pruebas)", () => {
    expect(() => httpTransport("http://prewww1.aeat.es/ws", null)).toThrow("La conexión con la AEAT debe ser HTTPS.");
    for (const local of ["http://localhost:1/ws", "http://127.0.0.1:1/ws", "http://[::1]:1/ws"]) expect(() => httpTransport(local, null)).not.toThrow();
  });
});

describe("clasificación del resultado del envío", () => {
  const transportOf = (status: number, body: string): Transport => () => Promise.resolve({ status, body });

  it("respuesta de la AEAT: se aplica registro a registro", async () => {
    expect(await submit(transportOf(200, RESPONSE), "<x/>")).toMatchObject({ kind: "answered", response: { waitSeconds: 90, globalState: "Correcto" } });
  });

  it("Fault de servidor, respuesta ilegible o sin conexión: reintentar", async () => {
    expect(await submit(transportOf(500, FAULT("soapenv:Server")), "<x/>")).toEqual({ kind: "retry", reason: "La AEAT no pudo procesar el envío (Motivo)." });
    expect(await submit(transportOf(503, "<html>Mantenimiento</html>"), "<x/>")).toEqual({ kind: "retry", reason: "Respuesta no reconocida de la AEAT (HTTP 503)." });
    expect(await submit(() => Promise.reject(new Error("ECONNREFUSED")), "<x/>")).toEqual({ kind: "retry", reason: "Sin conexión con la AEAT: ECONNREFUSED" });
    expect(await submit(() => Promise.reject(new Error()), "<x/>")).toEqual({ kind: "retry", reason: "Sin conexión con la AEAT: error desconocido" });
  });

  it("Fault de cliente: el envío está mal (certificado, esquema…) y hay que revisarlo antes de reenviar", async () => {
    expect(await submit(transportOf(500, FAULT("env:Client")), "<x/>")).toEqual({ kind: "attention", reason: "La AEAT rechazó el envío: Motivo" });
  });

  it("con el simulador local", async () => {
    expect(await submit(simulatorTransport(createSimulator()), "<x/>")).toMatchObject({ kind: "attention" });
  });
});

describe("estado de cada registro según la respuesta", () => {
  const line = { issuerNif: "12345678Z", number: "F-1", issueDate: "24-11-2026", operation: "Alta" as const, errorCode: null, errorDescription: null, duplicateState: null };

  it("Correcto y AceptadoConErrores quedan registrados", () => {
    expect(recordStatus({ ...line, state: "Correcto" })).toEqual({ status: "ACCEPTED", errorCode: null, errorDescription: null });
    expect(recordStatus({ ...line, state: "AceptadoConErrores", errorCode: "2000", errorDescription: "Huella" })).toEqual({ status: "ACCEPTED_WITH_ERRORS", errorCode: "2000", errorDescription: "Huella" });
  });

  it("un duplicado de algo que la AEAT ya tenía bien es el reenvío de una respuesta perdida: aceptado", () => {
    const duplicate = { ...line, state: "Incorrecto" as const, errorCode: "3000", errorDescription: "Duplicado" };
    expect(recordStatus({ ...duplicate, duplicateState: "Correcta" })).toEqual({ status: "ACCEPTED", errorCode: "3000", errorDescription: "Duplicado" });
    expect(recordStatus({ ...duplicate, duplicateState: "AceptadaConErrores" })).toEqual({ status: "ACCEPTED_WITH_ERRORS", errorCode: "3000", errorDescription: "Duplicado" });
    expect(recordStatus({ ...duplicate, duplicateState: "Anulada" })).toEqual({ status: "REJECTED", errorCode: "3000", errorDescription: "Duplicado" });
  });

  it("los demás rechazos quedan rechazados (hay que subsanarlos)", () => {
    expect(recordStatus({ ...line, state: "Incorrecto", errorCode: "1100", errorDescription: "Error" })).toEqual({ status: "REJECTED", errorCode: "1100", errorDescription: "Error" });
    // Solo el código de duplicado (3000) convierte el rechazo en «ya registrado».
    for (const duplicateState of ["Correcta", "AceptadaConErrores"] as const) {
      expect(recordStatus({ ...line, state: "Incorrecto", errorCode: "1100", errorDescription: "Error", duplicateState })).toMatchObject({ status: "REJECTED" });
    }
  });
});
