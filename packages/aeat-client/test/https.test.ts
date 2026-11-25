// HTTPS con certificado cliente (descripción de los servicios web v1.0.3, apartado 4.3): el transporte presenta el
// PKCS#12 del contribuyente al servidor. Servidor TLS local y certificados ficticios generados en memoria.
import { createServer, type Server } from "node:https";
import { TLSSocket } from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { httpTransport } from "../src/transport";
import { fictitiousCertificate } from "./support";

let server: Server;
let url = "";
let presentedBy: string | undefined;
const previousTlsSetting = process.env["NODE_TLS_REJECT_UNAUTHORIZED"];

beforeAll(async () => {
  const serverCertificate = fictitiousCertificate("localhost", "x");
  server = createServer({ key: serverCertificate.keyPem, cert: serverCertificate.certPem, requestCert: true, rejectUnauthorized: false }, (request, response) => {
    // Sin certificado cliente, getPeerCertificate() devuelve un objeto vacío.
    const peer = request.socket instanceof TLSSocket ? request.socket.getPeerCertificate() : null;
    presentedBy = peer === null || Object.keys(peer).length === 0 ? undefined : String(peer.subject.CN);
    response.writeHead(200).end("<ok/>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  url = `https://127.0.0.1:${String(typeof address === "object" && address !== null ? address.port : 0)}/ws`;
  // Solo en esta prueba: el servidor local usa un certificado autofirmado.
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
});

afterAll(async () => {
  if (previousTlsSetting === undefined) delete process.env["NODE_TLS_REJECT_UNAUTHORIZED"];
  else process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = previousTlsSetting;
  await new Promise((resolve) => server.close(resolve));
});

describe("HTTPS con certificado cliente", () => {
  it("presenta el certificado del contribuyente", async () => {
    const client = fictitiousCertificate("Persona Ficticia - 12345678Z", "secreto-ficticio");
    expect(await httpTransport(url, { pfx: client.pfx, passphrase: "secreto-ficticio" })("<x/>")).toEqual({ status: 200, body: "<ok/>" });
    expect(presentedBy).toBe("Persona Ficticia - 12345678Z");
  });

  it("sin certificado no presenta ninguno", async () => {
    presentedBy = "sin comprobar";
    await httpTransport(url, null)("<x/>");
    expect(presentedBy).toBeUndefined();
  });
});
