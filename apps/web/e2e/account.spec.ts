// Fase 7: datos personales (RGPD arts. 15 y 20) y desactivación de la cuenta, con navegador real. Datos ficticios.
import { expect, test } from "@playwright/test";
import { createOrganization, PASSWORD, requireFullStack, signUpAndVerify } from "./support/flows";
import { countEmails, linkFromEmail, uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

test("descargar mis datos; un propietario único no puede desactivarse", async ({ page }) => {
  const email = uniqueEmail("cuenta");
  await signUpAndVerify(page, "Ana Ficticia", email);
  await createOrganization(page, `Taller Ficticio ${uniqueSuffix()}`);
  await page.getByRole("link", { name: "Mi cuenta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar mis datos" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("mis-datos-facturalibre.json");
  const data = JSON.parse(await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks as Buffer[]).toString("utf8"))) as {
    usuario: { email: string };
    organizaciones: { rol: string }[];
  };
  expect(data.usuario.email).toBe(email);
  expect(data.organizaciones.map((organization) => organization.rol)).toEqual(["OWNER"]);

  const form = page.getByRole("form", { name: "Desactivar la cuenta" });
  await form.getByLabel("Escribe tu email para confirmar").fill(email);
  await form.getByRole("button", { name: "Desactivar mi cuenta" }).click();
  await expect(form.getByText(/Eres el único propietario de una organización activa/)).toBeVisible();
});

test("sin organizaciones propias, la cuenta se desactiva y ya no se puede entrar", async ({ page }) => {
  const email = uniqueEmail("baja");
  await signUpAndVerify(page, "Bea Ficticia", email);
  await page.goto("/cuenta");
  const form = page.getByRole("form", { name: "Desactivar la cuenta" });
  await form.getByLabel("Escribe tu email para confirmar").fill(email);
  await form.getByRole("button", { name: "Desactivar mi cuenta" }).click();
  await expect(page).toHaveURL(/\/entrar/);

  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Esta cuenta está desactivada: ya no se puede entrar con ella.")).toBeVisible();
  await expect(page).toHaveURL(/\/entrar/);
});

test("con una cuenta sin confirmar se puede pedir otro enlace, al registrarse de nuevo o al intentar entrar", async ({ page }) => {
  const email = uniqueEmail("sin-confirmar");
  const verification = /Confirma tu email/;
  const signUp = async () => {
    await page.goto("/registro");
    await page.getByLabel("Nombre y apellidos").fill("Persona Ficticia");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Revisa tu bandeja de entrada.")).toBeVisible();
  };
  await signUp();
  await expect.poll(() => countEmails(email, verification), { timeout: 15_000 }).toBe(1);

  // Registrarse otra vez con el mismo email no envía nada (no se revela que existe), pero se puede pedir otro enlace.
  await signUp();
  await page.getByRole("button", { name: "Reenviar el correo de confirmación" }).click();
  await expect(page.getByRole("status").filter({ hasText: "le hemos enviado un enlace nuevo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reenviar de nuevo en [0-9]+ s/ })).toBeDisabled();
  await expect.poll(() => countEmails(email, verification), { timeout: 15_000 }).toBe(2);

  // Al intentar entrar sin confirmar: aviso claro y la misma opción.
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "tienes que confirmar tu email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar el correo de confirmación" })).toBeVisible();

  // El último enlace confirma la cuenta y entra.
  await page.goto(await linkFromEmail(email, verification));
  await expect(page.getByRole("heading", { level: 1, name: "Tus organizaciones" })).toBeVisible({ timeout: 20_000 });
});
