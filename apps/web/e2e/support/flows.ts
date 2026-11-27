// Pasos de usuario reutilizados por los recorridos E2E completos.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { linkFromEmail } from "./mailpit";

export const PASSWORD = "una-frase-de-prueba-larga";

/** Los recorridos completos necesitan PostgreSQL migrado, Mailpit y APP_BASE_URL = baseURL (ver docs/deployment/docker.md). */
export function requireFullStack(): void {
  test.skip(process.env["E2E_FULL_STACK"] !== "1", "Recorridos completos desactivados: define E2E_FULL_STACK=1");
}

export async function signUpAndVerify(page: Page, name: string, email: string, startAt = "/registro"): Promise<void> {
  await page.goto(startAt);
  await page.getByLabel("Nombre y apellidos").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Revisa tu bandeja de entrada" })).toBeVisible();
  await page.goto(await linkFromEmail(email, /Confirma tu email/));
}

export async function createOrganization(page: Page, name: string): Promise<string> {
  await page.getByRole("link", { name: "Crear organización" }).click();
  await page.getByLabel("Nombre de la organización").fill(name);
  const slug = await page.getByLabel("Dirección").inputValue();
  await page.getByRole("button", { name: "Crear organización" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return slug;
}

export async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Invita desde Equipo y devuelve el enlace de la invitación recibido por email. */
export async function invite(page: Page, email: string, role: string, scope: "ALL_TAXPAYERS" | "ASSIGNED_TAXPAYERS"): Promise<string> {
  await page.getByRole("link", { name: "Equipo", exact: true }).click();
  const form = page.getByRole("form", { name: "Invitar a alguien" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Rol").selectOption(role);
  await form.getByLabel("Contribuyentes").selectOption(scope);
  await form.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByRole("status")).toContainText(`Invitación enviada a ${email}`);
  return linkFromEmail(email, /te invita a/);
}

/** Abre la invitación sin cuenta, se registra con ese email, ve a qué organización se une y acepta. */
export async function acceptAsNewUser(page: Page, invitationUrl: string, name: string, email: string): Promise<void> {
  await page.goto(invitationUrl);
  await page.getByRole("link", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/registro\?volver=%2Finvitacion%2F/);
  await signUpAndVerify(page, name, email, page.url());
  await expect(page.getByText(/^Te han invitado a /)).toBeVisible();
  await page.getByRole("button", { name: "Aceptar y entrar" }).click();
}
