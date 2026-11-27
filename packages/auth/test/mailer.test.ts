// Envío por la API HTTPS de Resend (Railway bloquea el SMTP saliente): forma de la petición y errores.
import { describe, expect, it } from "vitest";
import { createResendMailer } from "../src";

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown = { id: "email-ficticio" }): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  return { fetch: impl, calls };
}

describe("createResendMailer", () => {
  it("envía por la API con el remitente, responder a y los adjuntos en base64", async () => {
    const { fetch, calls } = fakeFetch(200);
    const mailer = createResendMailer("re_clave_ficticia", "FacturaLibre <no-responder@example.test>", fetch);
    await mailer.send({
      to: "cliente@example.test",
      subject: "Borrador de factura",
      text: "Hola",
      html: "<p>Hola</p>",
      replyTo: "ana@example.test",
      attachments: [{ filename: "borrador.pdf", content: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }],
    });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.resend.com/emails");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toMatchObject({ authorization: "Bearer re_clave_ficticia", "content-type": "application/json" });
    expect(JSON.parse(call?.init.body as string)).toEqual({
      from: "FacturaLibre <no-responder@example.test>",
      to: ["cliente@example.test"],
      subject: "Borrador de factura",
      text: "Hola",
      html: "<p>Hola</p>",
      reply_to: "ana@example.test",
      attachments: [{ filename: "borrador.pdf", content: "JVBERg==", content_type: "application/pdf" }],
    });
  });

  it("sin adjuntos ni responder a, no los envía", async () => {
    const { fetch, calls } = fakeFetch(200);
    await createResendMailer("re_x", "FacturaLibre <a@example.test>", fetch).send({ to: "b@example.test", subject: "S", text: "T", html: "H" });
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ from: "FacturaLibre <a@example.test>", to: ["b@example.test"], subject: "S", text: "T", html: "H" });
  });

  it("si Resend lo rechaza, falla con su código y mensaje (nunca con la clave)", async () => {
    const { fetch } = fakeFetch(403, { name: "validation_error", message: "The domain is not verified." });
    const sending = createResendMailer("re_secreta", "FacturaLibre <a@example.test>", fetch).send({ to: "b@example.test", subject: "S", text: "T", html: "H" });
    await expect(sending).rejects.toThrow("Resend 403: The domain is not verified.");
    await expect(sending).rejects.not.toThrow(/re_secreta/);
  });
});
