// Fase 7: datos personales (RGPD arts. 15 y 20) y desactivación de la cuenta, con navegador real. Datos ficticios.
import { expect, test } from "@playwright/test";
import { createOrganization, PASSWORD, requireFullStack, signUpAndVerify } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

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
