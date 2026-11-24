// QR tributario: «Detalle de las especificaciones técnicas del código QR», AEAT v0.5.0 (10/12/2025).
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrSvg, qrUrl } from "../src/qr";

const invoice = { issuerNif: "89890001K", number: "12345678&G33", issueDate: "2024-01-01" };

describe("URL del servicio de cotejo", () => {
  it("entorno de pruebas, con «URL encoding» de los parámetros (ejemplo del apartado 4)", () => {
    expect(qrUrl("test", invoice, "241.40")).toBe(
      "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40",
    );
  });

  it("entorno de producción (apartado 5.1)", () => {
    expect(qrUrl("production", { ...invoice, number: "F2026-0001" }, "163.96")).toBe(
      "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=F2026-0001&fecha=01-01-2024&importe=163.96",
    );
  });

  it("solo los 4 parámetros obligatorios (nunca «formato», apartado 7)", () => {
    expect([...new URL(qrUrl("test", invoice, "1.00")).searchParams.keys()]).toEqual(["nif", "numserie", "fecha", "importe"]);
  });
});

describe("imagen del QR", () => {
  it("SVG con nivel de corrección M (OM art. 21.1) y sin margen propio (el margen lo pone la página)", async () => {
    const url = qrUrl("test", invoice, "241.40");
    const svg = await qrSvg(url);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
    const reference = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
    expect(svg).toBe(reference);
    expect(svg).not.toBe(await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "L", margin: 0 }));
  });
});
