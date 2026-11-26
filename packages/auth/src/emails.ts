// Plantillas de los correos transaccionales (funciones puras). Texto plano + HTML mínimo y accesible.
// Nunca incluyen contraseñas; los enlaces llevan tokens de un solo uso y caducidad corta.

export interface EmailAttachment {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly contentType: string;
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly attachments?: readonly EmailAttachment[];
  /** A quién responde el destinatario si no es al remitente. */
  readonly replyTo?: string;
}

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

interface ActionEmail {
  readonly to: string;
  readonly subject: string;
  readonly greeting: string;
  readonly body: string;
  readonly action: string;
  readonly url: string;
  readonly footer: string;
}

function actionEmail(email: ActionEmail): OutgoingEmail {
  const text = [email.greeting, "", email.body, "", `${email.action}: ${email.url}`, "", email.footer, "", "— FacturaLibre"].join("\n");
  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(email.greeting)}</p>
<p>${escapeHtml(email.body)}</p>
<p><a href="${escapeHtml(email.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(email.action)}</a></p>
<p style="font-size:14px;color:#555">Si el botón no funciona, copia este enlace en tu navegador:<br>${escapeHtml(email.url)}</p>
<p style="font-size:14px;color:#555">${escapeHtml(email.footer)}</p>
<p>— FacturaLibre</p>
</body></html>`;
  return { to: email.to, subject: email.subject, text, html };
}

type AccountEmailText = Pick<ActionEmail, "subject" | "body" | "action" | "footer">;

const ACCOUNT_EMAILS: Readonly<Record<"verify-email" | "reset-password", AccountEmailText>> = {
  "verify-email": {
    subject: "Confirma tu email en FacturaLibre",
    body: "Gracias por registrarte. Confirma tu dirección de email para activar tu cuenta.",
    action: "Confirmar mi email",
    footer: "El enlace caduca en 24 horas. Si no has creado una cuenta, ignora este mensaje.",
  },
  "reset-password": {
    subject: "Restablece tu contraseña de FacturaLibre",
    body: "Hemos recibido una solicitud para restablecer tu contraseña. Al cambiarla se cerrarán todas tus sesiones abiertas.",
    action: "Elegir una contraseña nueva",
    footer: "El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.",
  },
};

/** Correos de la propia cuenta (verificación de email y restablecimiento de contraseña). */
export function accountEmail(kind: keyof typeof ACCOUNT_EMAILS, user: { readonly email: string; readonly name: string }, url: string): OutgoingEmail {
  return actionEmail({ ...ACCOUNT_EMAILS[kind], to: user.email, greeting: `Hola, ${user.name}:`, url });
}

export interface InvitationMessage {
  readonly to: string;
  readonly inviterName: string;
  readonly tenantName: string;
  readonly roleLabel: string;
  readonly url: string;
}

export function invitationMessage(invitation: InvitationMessage): OutgoingEmail {
  return actionEmail({
    to: invitation.to,
    subject: `${invitation.inviterName} te invita a ${invitation.tenantName} en FacturaLibre`,
    greeting: "Hola:",
    body: `${invitation.inviterName} te ha invitado a unirte a «${invitation.tenantName}» con el rol ${invitation.roleLabel}.`,
    action: "Ver la invitación",
    url: invitation.url,
    footer: `La invitación caduca en 7 días y solo puede aceptarla la cuenta ${invitation.to}.`,
  });
}

export interface DocumentMessage {
  readonly to: string;
  /** Quien factura (razón social del contribuyente): el correo va en su nombre. */
  readonly senderName: string;
  /** «Borrador de factura» o «Factura F2026-0001». */
  readonly title: string;
  readonly draft: boolean;
  /** Total ya formateado («121,00 €»). */
  readonly total: string;
  /** Mensaje libre de quien envía; null si no escribe nada. */
  readonly note: string | null;
  /** Email de quien factura, para que el cliente le conteste a él. */
  readonly replyTo?: string | null;
  readonly pdf: { readonly filename: string; readonly content: Uint8Array };
}

const DRAFT_NOTICE = "Es un borrador para que lo revises: todavía no es una factura y no tiene validez fiscal.";

/** Borrador o factura en PDF para el cliente. El texto del usuario se escapa y conserva sus saltos de línea. */
export function documentMessage(message: DocumentMessage): OutgoingEmail {
  const intro = `${message.senderName} te envía: ${message.title}.`;
  const paragraphs = [intro, ...(message.note === null ? [] : [message.note]), `Total: ${message.total}`, ...(message.draft ? [DRAFT_NOTICE] : []), "Lo encontrarás adjunto en PDF."];
  const text = [...paragraphs, "— Enviado con FacturaLibre"].join("\n\n");
  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("\n")}
<p style="font-size:14px;color:#555">— Enviado con FacturaLibre</p>
</body></html>`;
  return {
    to: message.to,
    subject: `${message.title} de ${message.senderName}`,
    text,
    html,
    attachments: [{ filename: message.pdf.filename, content: message.pdf.content, contentType: "application/pdf" }],
    ...(message.replyTo == null ? {} : { replyTo: message.replyTo }),
  };
}
