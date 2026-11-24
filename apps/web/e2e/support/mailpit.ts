// Lectura de la bandeja de Mailpit (docker compose) para seguir los enlaces de los correos en E2E.
import { expect } from "@playwright/test";

const MAILPIT_URL = process.env["E2E_MAILPIT_URL"] ?? "http://localhost:8025";

interface MessageSummary {
  readonly ID: string;
  readonly Subject: string;
}

async function search(to: string, subject: RegExp): Promise<MessageSummary | undefined> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const body = (await response.json()) as { messages: MessageSummary[] };
  return body.messages.find((message) => subject.test(message.Subject));
}

/** Espera el último correo a `to` cuyo asunto encaje y devuelve el primer enlace de su texto. */
export async function linkFromEmail(to: string, subject: RegExp): Promise<string> {
  let found: MessageSummary | undefined;
  await expect.poll(async () => (found = await search(to, subject)) !== undefined, { timeout: 15_000 }).toBe(true);
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${found?.ID ?? ""}`);
  const message = (await response.json()) as { Text: string };
  const link = /https?:\/\/\S+/.exec(message.Text)?.[0];
  if (link === undefined) throw new Error(`El correo "${found?.Subject ?? ""}" no contiene enlaces`);
  return link;
}

export const uniqueEmail = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.test`;
