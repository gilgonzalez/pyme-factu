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
