// Comprobación al arrancar: en producción la web no se pone en marcha si falta un dato obligatorio.
// Sin ella, un secreto olvidado solo se descubriría en la primera petición que lo usara
// (en Docker Compose lo impide docker-compose.prod.yml; en Railway u otra plataforma, esto).

const REQUIRED_IN_PRODUCTION = [
  "APP_DATABASE_URL",
  "AUTH_DATABASE_URL",
  "APP_BASE_URL",
  "AUTH_SECRET",
  "MAIL_FROM",
  "CERTIFICATE_KEK",
  "SIF_PRODUCER_NAME",
  "SIF_PRODUCER_NIF",
  "SIF_VERSION",
  "SIF_DECLARATION_URL",
] as const;

export function register(): void {
  if (process.env["NEXT_RUNTIME"] !== "nodejs" || process.env["FACTURALIBRE_ENV"] !== "production") return;
  const missing: string[] = REQUIRED_IN_PRODUCTION.filter((name) => (process.env[name]?.trim() ?? "") === "");
  const baseUrl = process.env["APP_BASE_URL"]?.trim() ?? "";
  if (baseUrl !== "" && !baseUrl.startsWith("https://")) missing.push("APP_BASE_URL (debe empezar por https://)");
  // Correo: por la API de Resend (RESEND_API_KEY) o por SMTP (SMTP_URL).
  if ((process.env["RESEND_API_KEY"]?.trim() ?? "") === "" && (process.env["SMTP_URL"]?.trim() ?? "") === "") missing.push("RESEND_API_KEY o SMTP_URL");
  if (missing.length > 0) {
    console.error(JSON.stringify({ level: "error", msg: "configuración de producción incompleta", missing }));
    process.exit(1);
  }
}
