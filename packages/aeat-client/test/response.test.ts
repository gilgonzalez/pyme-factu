// Simulador y lectura de la respuesta oficial. Los registros se construyen con @facturalibre/verifactu y la
// respuesta del simulador se valida contra RespuestaSuministro.xsd 1.0 (copia oficial versionada).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TaxBreakdown } from "@facturalibre/fiscal-core";
import { buildAlta, buildAnulacion, chainLinkOf, recordXml, soapEnvelope, submissionXml, type AltaRecord, type RecordContext } from "@facturalibre/verifactu";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";
import { parseEnvelope } from "../src/response";
import { createSimulator } from "../src/simulator";

const spec = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../verifactu/specs/1.0/${name}`, import.meta.url)), "utf8").replace(
    "http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd",
    "xmldsig-core-schema.xsd",
  );

async function validResponse(envelope: string): Promise<readonly string[]> {
  const inner = envelope.slice(envelope.indexOf("<env:Body>") + "<env:Body>".length, envelope.indexOf("</env:Body>"));
  const result = await validateXML({
    xml: [{ fileName: "respuesta.xml", contents: inner }],
    schema: [{ fileName: "RespuestaSuministro.xsd", contents: spec("RespuestaSuministro.xsd") }],
    preload: ["SuministroInformacion.xsd", "SuministroLR.xsd", "xmldsig-core-schema.xsd"].map((fileName) => ({ fileName, contents: spec(fileName) })),
  });
  return result.errors.map((error) => error.rawMessage);
}

const VAT21: TaxBreakdown = { key: "VAT:2100", tax: { kind: "VAT", ratePercent: 2100n }, base: 10000n, quota: 2100n, surchargePercent: 0n, surchargeQuota: 0n };
const context = (generatedAt: string, previous: RecordContext["previous"]): RecordContext => ({
  previous,
  generatedAt,
  system: { installationNumber: "1", multipleTaxpayers: false },
  software: { producerName: "Productor Ficticio SL", producerNif: "B12345674", name: "FacturaLibre", id: "FL", version: "0.6.0" },
});
const alta = (number: string, previous: RecordContext["previous"]): AltaRecord =>
  buildAlta(
    {
      invoice: { issuerNif: "12345678Z", number, issueDate: "2026-11-24" },
      issuerName: "Ana Ficticia Pérez",
      type: "F1",
      rectified: [],
      description: "Servicio",
      recipient: { name: "Cliente Ficticio SL", nif: "B12345674" },
      details: [VAT21],
    },
    context("2026-11-24T10:00:00+01:00", previous),
  );
const send = (records: readonly string[]) => soapEnvelope(submissionXml({ issuerName: "Ana Ficticia Pérez", issuerNif: "12345678Z", incident: false }, records));

describe("simulador de la AEAT", () => {
  it("acepta registros nuevos con su huella correcta; la respuesta cumple el XSD oficial", async () => {
    const first = alta("F2026-0001", null);
    const second = alta("F2026-0002", chainLinkOf(first));
    const reply = createSimulator().handle(send([recordXml(first), recordXml(second)]));
    expect(reply.status).toBe(200);
    expect(await validResponse(reply.body)).toEqual([]);
    const parsed = parseEnvelope(reply.body);
    expect(parsed).toMatchObject({ kind: "response", response: { waitSeconds: 60, globalState: "Correcto" } });
    if (parsed.kind !== "response") return;
    expect(parsed.response.csv).toMatch(/^[0-9A-F]{16}$/);
    expect(reply.body).toContain("<sf:NIFPresentador>12345678Z</sf:NIFPresentador>");
    expect(reply.body).toContain("<sf:ObligadoEmision><sf:NombreRazon>Ana Ficticia Pérez</sf:NombreRazon><sf:NIF>12345678Z</sf:NIF></sf:ObligadoEmision>");
    expect(parsed.response.lines).toEqual([
      { issuerNif: "12345678Z", number: "F2026-0001", issueDate: "24-11-2026", operation: "Alta", state: "Correcto", errorCode: null, errorDescription: null, duplicateState: null },
      { issuerNif: "12345678Z", number: "F2026-0002", issueDate: "24-11-2026", operation: "Alta", state: "Correcto", errorCode: null, errorDescription: null, duplicateState: null },
    ]);
  });

  it("un reenvío del mismo registro se rechaza por duplicado (3000) indicando que ya estaba correcto", async () => {
    const simulator = createSimulator(30);
    const record = recordXml(alta("F2026-0001", null));
    simulator.handle(send([record]));
    const reply = simulator.handle(send([record]));
    expect(await validResponse(reply.body)).toEqual([]);
    expect(parseEnvelope(reply.body)).toEqual({
      kind: "response",
      response: {
        csv: null,
        waitSeconds: 30,
        globalState: "Incorrecto",
        lines: [
          {
            issuerNif: "12345678Z",
            number: "F2026-0001",
            issueDate: "24-11-2026",
            operation: "Alta",
            state: "Incorrecto",
            errorCode: "3000",
            errorDescription: "Registro de facturación duplicado.",
            duplicateState: "Correcta",
          },
        ],
      },
    });
  });

  it("un envío mixto (duplicado + nuevo) es parcialmente correcto y lleva CSV; lo aceptado con errores se recuerda así", () => {
    const simulator = createSimulator();
    const tampered = recordXml(alta("F2026-0001", null)).replace(/<sf:Huella>[0-9A-F]{64}<\/sf:Huella><\/sf:RegistroAlta>/, `<sf:Huella>${"0".repeat(64)}</sf:Huella></sf:RegistroAlta>`);
    simulator.handle(send([tampered]));
    const parsed = parseEnvelope(simulator.handle(send([tampered, recordXml(alta("F2026-0002", null))])).body);
    expect(parsed).toMatchObject({ response: { globalState: "ParcialmenteCorrecto", lines: [{ errorCode: "3000", duplicateState: "AceptadaConErrores" }, { state: "Correcto" }] } });
    expect(parsed.kind === "response" ? parsed.response.csv : null).not.toBeNull();
  });

  it("lee peticiones con sangría y atributos: valores recortados, sin confundir atributos con el texto", () => {
    const pretty = recordXml(alta("F2026-0001", null)).replace(
      "<sf:NumSerieFactura>F2026-0001</sf:NumSerieFactura>",
      '<sf:NumSerieFactura orden="1">\n      F2026-0001\n    </sf:NumSerieFactura>',
    );
    const reply = createSimulator().handle(send([pretty]));
    expect(reply.body).toContain("<sf:NumSerieFactura>F2026-0001</sf:NumSerieFactura>");
    expect(parseEnvelope(reply.body)).toMatchObject({ response: { lines: [{ state: "Correcto" }] } });
  });

  it("escapa los textos de la cabecera en la respuesta", () => {
    const body = soapEnvelope(submissionXml({ issuerName: "Ana & Hijos <SL>", issuerNif: "12345678Z", incident: false }, [recordXml(alta("F2026-0001", null))]));
    expect(createSimulator().handle(body).body).toContain("<sf:NombreRazon>Ana &amp; Hijos &lt;SL&gt;</sf:NombreRazon>");
  });

  it("una huella mal calculada se acepta con errores (2000)", () => {
    const record = recordXml(alta("F2026-0001", null)).replace(/<sf:Huella>[0-9A-F]{64}<\/sf:Huella><\/sf:RegistroAlta>/, `<sf:Huella>${"0".repeat(64)}</sf:Huella></sf:RegistroAlta>`);
    const parsed = parseEnvelope(createSimulator().handle(send([record, recordXml(alta("F2026-0002", null))])).body);
    expect(parsed).toMatchObject({ kind: "response", response: { globalState: "ParcialmenteCorrecto", lines: [{ state: "AceptadoConErrores", errorCode: "2000" }, { state: "Correcto" }] } });
  });

  it("anular algo que la AEAT no tiene se rechaza (3002); lo registrado se anula y queda anulado", async () => {
    const simulator = createSimulator();
    const first = alta("F2026-0001", null);
    const annulment = buildAnulacion(first.data.invoice, context("2026-11-24T10:05:00+01:00", chainLinkOf(first)));
    expect(parseEnvelope(simulator.handle(send([recordXml(annulment)])).body)).toMatchObject({ response: { lines: [{ operation: "Anulacion", state: "Incorrecto", errorCode: "3002" }] } });
    const reply = simulator.handle(send([recordXml(first), recordXml(annulment)]));
    expect(await validResponse(reply.body)).toEqual([]);
    expect(parseEnvelope(reply.body)).toMatchObject({ response: { globalState: "Correcto", lines: [{ operation: "Alta" }, { operation: "Anulacion", state: "Correcto" }] } });
    expect(parseEnvelope(simulator.handle(send([recordXml(first)])).body)).toMatchObject({ response: { lines: [{ errorCode: "3000", duplicateState: "Anulada" }] } });
  });

  it("una anulación con la huella mal calculada se acepta con errores (2000)", () => {
    const simulator = createSimulator();
    const first = alta("F2026-0001", null);
    simulator.handle(send([recordXml(first)]));
    const annulment = recordXml(buildAnulacion(first.data.invoice, context("2026-11-24T10:05:00+01:00", chainLinkOf(first)))).replace(/<sf:Huella>[0-9A-F]{64}<\/sf:Huella><\/sf:RegistroAnulacion>/, `<sf:Huella>${"0".repeat(64)}</sf:Huella></sf:RegistroAnulacion>`);
    expect(parseEnvelope(simulator.handle(send([annulment])).body)).toMatchObject({ response: { lines: [{ operation: "Anulacion", state: "AceptadoConErrores", errorCode: "2000" }] } });
  });

  it("un envío sin registros o ilegible es un SOAP Fault de cliente con el código oficial", () => {
    const cases = [
      [soapEnvelope("<x/>"), "4102 = El XML no cumple el esquema. Falta informar campo obligatorio."],
      ["<<no es xml", "4103 = Se ha producido un error inesperado al parsear el XML."],
    ] as const;
    for (const [request, message] of cases) {
      const reply = createSimulator().handle(request);
      expect(reply.status).toBe(500);
      expect(parseEnvelope(reply.body)).toEqual({ kind: "fault", code: "env:Client", message });
    }
  });
});

describe("lectura de respuestas", () => {
  it("un Fault de servidor", () => {
    const body = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>Error interno</faultstring></s:Fault></s:Body></s:Envelope>`;
    expect(parseEnvelope(body)).toEqual({ kind: "fault", code: "s:Server", message: "Error interno" });
  });

  it("un Fault sin código ni texto", () => {
    expect(parseEnvelope(`<s:Envelope xmlns:s="x"><s:Body><s:Fault/></s:Body></s:Envelope>`)).toEqual({ kind: "fault", code: "", message: "" });
  });

  it("respuesta con sangría y atributos (como la real): se leen los valores sin espacios", () => {
    const body = `<s:Envelope xmlns:s="x"><s:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y">
        <r:CSV>
          ABC123
        </r:CSV>
        <r:TiempoEsperaEnvio a="1">90</r:TiempoEsperaEnvio>
        <r:EstadoEnvio>Correcto</r:EstadoEnvio>
      </r:RespuestaRegFactuSistemaFacturacion></s:Body></s:Envelope>`;
    expect(parseEnvelope(body)).toEqual({ kind: "response", response: { csv: "ABC123", waitSeconds: 90, globalState: "Correcto", lines: [] } });
  });

  it("CSV vacío es «sin CSV»; un tiempo de espera negativo o decimal no vale", () => {
    const response = (csv: string, wait: string) =>
      `<s:Envelope xmlns:s="x"><s:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y"><r:CSV>${csv}</r:CSV><r:TiempoEsperaEnvio>${wait}</r:TiempoEsperaEnvio><r:EstadoEnvio>Incorrecto</r:EstadoEnvio></r:RespuestaRegFactuSistemaFacturacion></s:Body></s:Envelope>`;
    expect(parseEnvelope(response("", "-5"))).toMatchObject({ response: { csv: null, waitSeconds: 60 } });
    expect(parseEnvelope(response("", "1.5"))).toMatchObject({ response: { waitSeconds: 60 } });
    expect(parseEnvelope(response("X", "120"))).toMatchObject({ response: { csv: "X", waitSeconds: 120 } });
    expect(parseEnvelope(response("X", "0"))).toMatchObject({ response: { waitSeconds: 0 } });
  });

  it("lo que no es un sobre SOAP con respuesta o Fault no se interpreta", () => {
    for (const body of ["", "<html>Mantenimiento</html>", `<s:Envelope xmlns:s="x"><s:Body><Otra/></s:Body></s:Envelope>`]) expect(parseEnvelope(body)).toEqual({ kind: "unreadable" });
  });

  it("sin tiempo de espera válido se usa el inicial (60 s); sin estado, el registro es incorrecto", () => {
    const body = `<e:Envelope xmlns:e="x"><e:Body><r:RespuestaRegFactuSistemaFacturacion xmlns:r="y"><r:TiempoEsperaEnvio>pronto</r:TiempoEsperaEnvio><r:RespuestaLinea><r:IDFactura/></r:RespuestaLinea></r:RespuestaRegFactuSistemaFacturacion></e:Body></e:Envelope>`;
    expect(parseEnvelope(body)).toEqual({
      kind: "response",
      response: {
        csv: null,
        waitSeconds: 60,
        globalState: "Incorrecto",
        lines: [{ issuerNif: "", number: "", issueDate: "", operation: "Alta", state: "Incorrecto", errorCode: null, errorDescription: null, duplicateState: null }],
      },
    });
  });
});
