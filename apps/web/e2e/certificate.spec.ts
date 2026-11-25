// Fase 6: certificado electrónico del contribuyente con navegador real. Certificado FICTICIO generado en memoria
// (nunca uno real); se guarda cifrado y nunca vuelve al navegador.
import { fictitiousCertificate } from "@facturalibre/aeat-client/testing";
import { expect, test } from "@playwright/test";
import { createOrganization, requireFullStack, signUpAndVerify } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

test("subir, sustituir y borrar el certificado; un fichero que no lo es se rechaza", async ({ page }) => {
  await signUpAndVerify(page, "Ana Ficticia", uniqueEmail("certificado"));
  await createOrganization(page, `Asesoría Ficticia ${uniqueSuffix()}`);
  await page.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const taxpayer = page.getByRole("form", { name: "Nuevo contribuyente" });
  await taxpayer.getByLabel("NIF").fill("12345678Z");
  await taxpayer.getByLabel("Nombre y apellidos o razón social").fill("Ana Ficticia Pérez");
  await taxpayer.getByRole("button", { name: "Dar de alta" }).click();

  await page.getByRole("navigation", { name: "Secciones del contribuyente" }).getByRole("link", { name: "Certificado" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Certificado electrónico" })).toBeVisible();
  await expect(page.getByText("simulador local (entorno de desarrollo: nada llega a la AEAT)")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sin certificado" })).toBeVisible();

  const form = page.getByRole("form", { name: "Subir el certificado" });
  await form.getByLabel("Fichero del certificado (.p12 o .pfx)").setInputFiles({ name: "no-es-un-certificado.p12", mimeType: "application/x-pkcs12", buffer: Buffer.from("texto") });
  await form.getByLabel("Contraseña del certificado").fill("ficticia");
  await form.getByRole("button", { name: "Guardar certificado" }).click();
  await expect(form.getByText("El certificado no se abre con esa contraseña o no es un fichero .p12/.pfx.")).toBeVisible();

  const { pfx } = fictitiousCertificate("Ana Ficticia Pérez - 12345678Z", "secreto-ficticio");
  await form.getByLabel("Fichero del certificado (.p12 o .pfx)").setInputFiles({ name: "certificado.p12", mimeType: "application/x-pkcs12", buffer: pfx });
  await form.getByLabel("Contraseña del certificado").fill("secreto-ficticio");
  await form.getByRole("button", { name: "Guardar certificado" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Certificado guardado el / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sustituir certificado" })).toBeVisible();

  await page.getByRole("form", { name: "Borrar el certificado" }).getByRole("button", { name: "Borrar certificado" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Sin certificado" })).toBeVisible();
});
