// El XML generado se valida contra los esquemas OFICIALES versionados en specs/1.0 (SuministroLR.xsd,
// SuministroInformacion.xsd y xmldsig-core-schema.xsd del W3C), sin red: libxml2 compilado a WebAssembly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TaxBreakdown } from "@facturalibre/fiscal-core";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";
import { buildAlta, buildAnulacion, chainLinkOf, type AltaData, type RecordContext } from "../src/record";
import { recordXml, soapEnvelope, submissionXml } from "../src/xml";

const spec = (name: string): string => readFileSync(fileURLToPath(new URL(`../specs/1.0/${name}`, import.meta.url)), "utf8");
const XMLDSIG_URL = "http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd";

async function validate(xml: string): Promise<{ valid: boolean; errors: readonly string[] }> {
  const result = await validateXML({
    xml: [{ fileName: "envio.xml", contents: xml }],
    schema: [{ fileName: "SuministroLR.xsd", contents: spec("SuministroLR.xsd") }],
    preload: [
      // El XSD oficial importa xmldsig por URL; se sirve la copia local versionada.
      { fileName: "SuministroInformacion.xsd", contents: spec("SuministroInformacion.xsd").replace(XMLDSIG_URL, "xmldsig-core-schema.xsd") },
      { fileName: "xmldsig-core-schema.xsd", contents: spec("xmldsig-core-schema.xsd") },
    ],
  });
  return { valid: result.valid, errors: result.errors.map((error) => error.rawMessage) };
}

const detail = (key: string, tax: TaxBreakdown["tax"], base: bigint, quota: bigint, surchargePercent = 0n, surchargeQuota = 0n): TaxBreakdown => ({
  key,
  tax,
  base,
  quota,
  surchargePercent,
  surchargeQuota,
});

const software = { producerName: "Productor Ficticio & Asociados SL", producerNif: "B12345674", name: "FacturaLibre", id: "FL", version: "0.5.0" };
const context = (generatedAt: string, previous: RecordContext["previous"]): RecordContext => ({
  previous,
  system: { installationNumber: "019a0000-0000-7000-8000-000000000001", multipleTaxpayers: true },
  software,
  generatedAt,
});

const standard: AltaData = {
  invoice: { issuerNif: "12345678Z", number: "F2026-0001", issueDate: "2026-11-24" },
  issuerName: "Ana Ficticia Pérez <Fontanería>",
  type: "F1",
  rectified: [],
  description: "Reparación de caldera; Hora de trabajo",
  recipient: { name: "Cliente Ficticio SL", nif: "B12345674" },
  details: [
    detail("VAT:2100", { kind: "VAT", ratePercent: 2100n }, 13550n, 2846n, 520n, 705n),
    detail("VAT:0", { kind: "VAT", ratePercent: 0n }, 1000n, 0n),
    detail("EXEMPT:E1", { kind: "EXEMPT", cause: "E1" }, 5000n, 0n),
  ],
};

const first = buildAlta(standard, context("2026-11-24T10:00:00+01:00", null));
const correction = buildAlta(
  {
    ...standard,
    invoice: { ...standard.invoice, number: "R2026-0001" },
    type: "R1",
    rectified: [standard.invoice],
    details: [detail("VAT:2100", { kind: "VAT", ratePercent: 2100n }, -13550n, -2846n)],
  },
  context("2026-11-24T10:05:00+01:00", chainLinkOf(first)),
);
const annulment = buildAnulacion(standard.invoice, context("2026-11-24T10:10:00+01:00", chainLinkOf(correction)));
const header = { issuerName: standard.issuerName, issuerNif: standard.invoice.issuerNif, incident: false };

describe("XML de remisión frente a los XSD oficiales", () => {
  it("un envío con un alta (primer registro), una rectificativa y una anulación es válido", async () => {
    const result = await validate(submissionXml(header, [first, correction, annulment].map(recordXml)));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("con incidencia técnica (art. 16.4 de la OM) también es válido", async () => {
    expect((await validate(submissionXml({ ...header, incident: true }, [recordXml(first)]))).valid).toBe(true);
  });

  it("control negativo: el validador rechaza un registro sin huella", async () => {
    const broken = recordXml(first).replace(/<sf:Huella>[0-9A-F]{64}<\/sf:Huella>/, "");
    expect((await validate(submissionXml(header, [broken]))).valid).toBe(false);
  });
});

describe("contenido del registro de alta", () => {
  const xml = recordXml(first);

  it("escapa los caracteres especiales (apartado 6.9) y quita los espacios de los extremos (6.7)", () => {
    expect(xml).toContain("<sf:NombreRazonEmisor>Ana Ficticia Pérez &lt;Fontanería&gt;</sf:NombreRazonEmisor>");
    expect(xml).toContain("<sf:NombreRazon>Productor Ficticio &amp; Asociados SL</sf:NombreRazon>");
    const quoted = recordXml(buildAlta({ ...standard, recipient: { name: ` "Comillas" y 'apóstrofos' `, nif: "B12345674" } }, context("2026-11-24T10:00:00+01:00", null)));
    expect(quoted).toContain("<sf:NombreRazon>&quot;Comillas&quot; y &apos;apóstrofos&apos;</sf:NombreRazon>");
  });

  it("un usuario con un solo obligado: IndicadorMultiplesOT=N", () => {
    const single = buildAlta(standard, { ...context("2026-11-24T10:00:00+01:00", null), system: { installationNumber: "1", multipleTaxpayers: false } });
    expect(recordXml(single)).toContain("<sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>");
  });

  it("sin la validación previa, faltar el NIF del cliente o la causa de exención es un error de programación", () => {
    const noNif = buildAlta({ ...standard, recipient: { name: "Sin NIF", nif: null } }, context("2026-11-24T10:00:00+01:00", null));
    expect(() => recordXml(noNif)).toThrow("Destinatario sin NIF: el registro debe pasar validateAlta antes de generarse.");
    const legacy = buildAlta(
      { ...standard, details: [detail("EXEMPT", { kind: "EXEMPT", cause: null }, 100n, 0n)] },
      context("2026-11-24T10:00:00+01:00", null),
    );
    expect(() => recordXml(legacy)).toThrow("Exención sin causa: el registro debe pasar validateAlta antes de generarse.");
  });

  it("primer registro: PrimerRegistro=S; los siguientes enlazan el anterior", () => {
    expect(xml).toContain("<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>");
    expect(recordXml(correction)).toContain(
      `<sf:RegistroAnterior><sf:IDEmisorFactura>12345678Z</sf:IDEmisorFactura><sf:NumSerieFactura>F2026-0001</sf:NumSerieFactura><sf:FechaExpedicionFactura>24-11-2026</sf:FechaExpedicionFactura><sf:Huella>${first.hash}</sf:Huella></sf:RegistroAnterior>`,
    );
  });

  it("desglose: IVA con recargo, IVA 0 % sin recargo y exenta con su causa", () => {
    expect(xml).toContain(
      "<sf:DetalleDesglose><sf:Impuesto>01</sf:Impuesto><sf:ClaveRegimen>01</sf:ClaveRegimen><sf:CalificacionOperacion>S1</sf:CalificacionOperacion><sf:TipoImpositivo>21</sf:TipoImpositivo><sf:BaseImponibleOimporteNoSujeto>135.50</sf:BaseImponibleOimporteNoSujeto><sf:CuotaRepercutida>28.46</sf:CuotaRepercutida><sf:TipoRecargoEquivalencia>5.2</sf:TipoRecargoEquivalencia><sf:CuotaRecargoEquivalencia>7.05</sf:CuotaRecargoEquivalencia></sf:DetalleDesglose>",
    );
    expect(xml).toContain("<sf:TipoImpositivo>0</sf:TipoImpositivo><sf:BaseImponibleOimporteNoSujeto>10.00</sf:BaseImponibleOimporteNoSujeto><sf:CuotaRepercutida>0.00</sf:CuotaRepercutida></sf:DetalleDesglose>");
    expect(xml).toContain("<sf:OperacionExenta>E1</sf:OperacionExenta><sf:BaseImponibleOimporteNoSujeto>50.00</sf:BaseImponibleOimporteNoSujeto></sf:DetalleDesglose>");
    expect(xml).toContain("<sf:CuotaTotal>35.51</sf:CuotaTotal><sf:ImporteTotal>231.01</sf:ImporteTotal>");
  });

  it("sistema informático, huso y huella", () => {
    expect(xml).toContain("<sf:IdSistemaInformatico>FL</sf:IdSistemaInformatico>");
    expect(xml).toContain("<sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu><sf:TipoUsoPosibleMultiOT>S</sf:TipoUsoPosibleMultiOT><sf:IndicadorMultiplesOT>S</sf:IndicadorMultiplesOT>");
    expect(xml).toContain(`<sf:FechaHoraHusoGenRegistro>2026-11-24T10:00:00+01:00</sf:FechaHoraHusoGenRegistro><sf:TipoHuella>01</sf:TipoHuella><sf:Huella>${first.hash}</sf:Huella>`);
  });

  it("rectificativa por diferencias: TipoRectificativa=I y la factura rectificada", () => {
    expect(recordXml(correction)).toContain(
      "<sf:TipoFactura>R1</sf:TipoFactura><sf:TipoRectificativa>I</sf:TipoRectificativa><sf:FacturasRectificadas><sf:IDFacturaRectificada><sf:IDEmisorFactura>12345678Z</sf:IDEmisorFactura><sf:NumSerieFactura>F2026-0001</sf:NumSerieFactura><sf:FechaExpedicionFactura>24-11-2026</sf:FechaExpedicionFactura></sf:IDFacturaRectificada></sf:FacturasRectificadas>",
    );
  });
});

describe("sobre SOAP y límites del envío", () => {
  it("envuelve el cuerpo en un sobre SOAP 1.1", () => {
    expect(soapEnvelope("<x/>")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body><x/></soapenv:Body></soapenv:Envelope>',
    );
  });

  it("entre 1 y 1.000 registros por envío", () => {
    expect(() => submissionXml(header, [])).toThrow("Un envío lleva entre 1 y 1.000 registros.");
    expect(() => submissionXml(header, Array.from({ length: 1001 }, () => "<x/>"))).toThrow(RangeError);
    expect(() => submissionXml(header, Array.from({ length: 1000 }, () => "<x/>"))).not.toThrow();
  });
});
