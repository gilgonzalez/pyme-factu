// Plantillas de los correos transaccionales (funciones puras). Texto plano + HTML mínimo y accesible.
// Nunca incluyen contraseñas; los enlaces llevan tokens de un solo uso y caducidad corta.

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
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

export function verifyEmailMessage(to: string, name: string, url: string): OutgoingEmail {
  return actionEmail({
    to,
    subject: "Confirma tu email en FacturaLibre",
    greeting: `Hola, ${name}:`,
    body: "Gracias por registrarte. Confirma tu dirección de email para activar tu cuenta.",
    action: "Confirmar mi email",
    url,
    footer: "El enlace caduca en 24 horas. Si no has creado una cuenta, ignora este mensaje.",
  });
}

export function resetPasswordMessage(to: string, name: string, url: string): OutgoingEmail {
  return actionEmail({
    to,
    subject: "Restablece tu contraseña de FacturaLibre",
    greeting: `Hola, ${name}:`,
    body: "Hemos recibido una solicitud para restablecer tu contraseña. Al cambiarla se cerrarán todas tus sesiones abiertas.",
    action: "Elegir una contraseña nueva",
    url,
    footer: "El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.",
  });
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
