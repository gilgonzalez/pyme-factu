// Administración de la plataforma de principio a fin: alta de un administrador con el script del rol propietario,
// panel, modo soporte de solo lectura y suspensión de una organización. Datos ficticios.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createOrganization, newPage, requireFullStack, signUpAndVerify, taxpayerSection } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

/** Como se hace en producción: el script con DATABASE_URL (rol propietario). */
function grantPlatformAdmin(email: string): void {
  execFileSync("pnpm", ["--filter", "@facturalibre/database", "admin:grant", email], { cwd: path.resolve(process.cwd(), "../.."), shell: true, stdio: "pipe" });
}

test("el administrador ve la plataforma, entra en soporte sin poder cambiar nada y suspende una organización", async ({ page, browser }) => {
  test.setTimeout(120_000);
  // Una clienta con su organización y su empresa.
  const member = await newPage(browser);
  await signUpAndVerify(member, "Clienta Ficticia", uniqueEmail("clienta"));
  const organization = `Clienta Ficticia ${uniqueSuffix()}`;
  const slug = await createOrganization(member, organization);
  await member.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const form = member.getByRole("form", { name: "Nuevo contribuyente" });
  await form.getByLabel("NIF").fill("B12345674");
  await form.getByLabel("Nombre y apellidos o razón social").fill("Clienta Ficticia SL");
  await form.getByRole("button", { name: "Dar de alta" }).click();
  await expect(member.getByRole("heading", { level: 1, name: "Clienta Ficticia SL" })).toBeVisible();

  // Quien no es administrador no ve la sección (404).
  await member.goto("/plataforma");
  await expect(member.getByRole("heading", { level: 1, name: "No hemos encontrado esta página" })).toBeVisible();

  // El administrador.
  const adminEmail = uniqueEmail("admin");
  await signUpAndVerify(page, "Admin Ficticio", adminEmail);
  grantPlatformAdmin(adminEmail);
  await page.goto("/organizaciones");
  await page.getByRole("link", { name: "Administrar la plataforma" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Administración de la plataforma" })).toBeVisible({ timeout: 20_000 });
  const row = page.getByRole("table", { name: "Organizaciones de la plataforma" }).getByRole("row").filter({ hasText: organization });
  await expect(row).toContainText("1 miembros · 1 contribuyentes", { timeout: 20_000 });

  // Soporte: ve la organización, en solo lectura y con el aviso.
  await row.getByRole("button", { name: "Entrar en soporte" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Modo soporte" })).toContainText(organization, { timeout: 20_000 });
  await (await taxpayerSection(page, "Empresa")).click();
  await expect(page.getByRole("heading", { level: 1, name: "Clienta Ficticia SL" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Datos del contribuyente" })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir del modo soporte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Administración de la plataforma" })).toBeVisible({ timeout: 20_000 });
  // Sin el soporte abierto, la organización vuelve a ser ajena.
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "No hemos encontrado esta página" })).toBeVisible();

  // Suspender: la clienta deja de poder entrar; al reactivar, vuelve.
  await page.goto("/plataforma");
  const suspendRow = page.getByRole("table", { name: "Organizaciones de la plataforma" }).getByRole("row").filter({ hasText: organization });
  await suspendRow.getByText("Suspender…").click();
  const suspend = suspendRow.getByRole("form", { name: `Suspender ${organization}` });
  await suspend.getByLabel("Motivo (opcional)").fill("Prueba de suspensión");
  await suspend.getByRole("button", { name: "Suspender" }).click();
  await expect(suspendRow).toContainText("Suspendida", { timeout: 20_000 });
  await member.goto(`/${slug}`);
  await expect(member.getByRole("heading", { level: 1, name: "Organización suspendida" })).toBeVisible();

  await suspendRow.getByRole("button", { name: "Reactivar" }).click();
  await expect(suspendRow).toContainText("Activa", { timeout: 20_000 });
  await member.goto(`/${slug}`);
  await expect(member.getByRole("heading", { level: 1, name: organization })).toBeVisible();
});
