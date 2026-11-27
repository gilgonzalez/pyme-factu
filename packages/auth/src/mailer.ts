import nodemailer from "nodemailer";
import type { OutgoingEmail } from "./emails";

/** Puerto de salida de correo. En desarrollo, SMTP de Mailpit; en pruebas, un buzón en memoria. */
export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Mailer SMTP. `smtpUrl` p. ej. smtp://mailpit:1025 (desarrollo) o smtps://usuario:clave@proveedor:465.
 * `from` es el remitente visible, p. ej. "FacturaLibre <no-responder@dominio>".
 */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(email) {
      await transport.sendMail({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo === undefined ? {} : { replyTo: email.replyTo }),
        attachments: email.attachments?.map(({ filename, content, contentType }) => ({ filename, content: Buffer.from(content), contentType })),
      });
    },
  };
}

/**
 * Mailer por la API HTTPS de Resend. Para plataformas que bloquean el SMTP saliente (Railway, salvo el plan Pro):
 * el SMTP agota el tiempo de conexión y el correo nunca sale. Un rechazo de Resend falla con su código y mensaje.
 */
export function createResendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send(email) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          ...(email.replyTo === undefined ? {} : { reply_to: email.replyTo }),
          ...(email.attachments === undefined
            ? {}
            : {
                attachments: email.attachments.map(({ filename, content, contentType }) => ({
                  filename,
                  content: Buffer.from(content).toString("base64"),
                  content_type: contentType,
                })),
              }),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { readonly message?: unknown };
        throw new Error(`Resend ${String(response.status)}: ${typeof body.message === "string" ? body.message : response.statusText}`);
      }
    },
  };
}
