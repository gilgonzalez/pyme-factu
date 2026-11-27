// Pasos de usuario reutilizados por los recorridos E2E completos.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { linkFromEmail } from "./mailpit";

export const PASSWORD = "una-frase-de-prueba-larga";

/** Enlace a una sección del contribuyente. En el móvil, las que no caben en la barra inferior están en «Más». */
export async function taxpayerSection(page: Page, name: string): Promise<Locator> {
  const sections = page.getByRole("navigation", { name: "Secciones del contribuyente" });
  await sections.waitFor();
  const link = sections.getByRole("link", { name, exact: true });
  if (!(await link.isVisible())) await sections.getByRole("button", { name: "Más" }).click();
  return link;
}

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

/** Da de alta el contribuyente ficticio con el que se factura en los recorridos. */
export async function createTaxpayer(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo contribuyente" });
  await form.getByLabel("NIF").fill("12345678Z");
  await form.getByLabel("Nombre y apellidos o razón social").fill("Ana Ficticia Pérez");
  await form.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ana Ficticia Pérez" })).toBeVisible();
}

/** Busca en un campo con buscador y elige la opción que coincida. */
export async function pick(page: Page, field: string, search: string, option: RegExp): Promise<void> {
  const combobox = page.getByRole("combobox", { name: field, exact: true });
  await combobox.fill(search);
  await page.getByRole("listbox", { name: field }).getByRole("option", { name: option }).click();
}
