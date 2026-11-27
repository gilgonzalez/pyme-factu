// Plantillas: guardar una factura que se repite con un nombre, empezar facturas desde ella cambiando lo que haga
// falta (cliente, cantidades) sin que la plantilla cambie, y guardar como plantilla un borrador. Datos ficticios.
import { expect, test } from "@playwright/test";
import { createOrganization, createTaxpayer, requireFullStack, signUpAndVerify, taxpayerSection } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

test("una plantilla con nombre prepara facturas que se ajustan sin cambiarla", async ({ page }) => {
  test.setTimeout(60_000);
  await signUpAndVerify(page, "Ana Ficticia", uniqueEmail("plantillas"));
  await createOrganization(page, `Mantenimientos Ficticios ${uniqueSuffix()}`);
  await createTaxpayer(page);

  // Plantilla nueva, con un cliente dado de alta desde el propio buscador.
  await (await taxpayerSection(page, "Plantillas")).click();
  await expect(page.getByText("Aún no tienes plantillas")).toBeVisible();
  await page.getByRole("link", { name: "Nueva plantilla" }).click();
  const editor = page.getByRole("form", { name: "Plantilla" });
  await editor.getByLabel("Nombre de la plantilla").fill("Mantenimiento mensual");
  await page.getByRole("combobox", { name: "Cliente (opcional)", exact: true }).fill("Comunidad Sol");
  await page.getByRole("option", { name: "Crear cliente «Comunidad Sol»" }).click();
  const newCustomer = page.getByRole("dialog", { name: "Nuevo cliente" });
  await newCustomer.getByRole("button", { name: "Guardar y elegir" }).click();
  await expect(newCustomer).toBeHidden();
  const line = page.getByRole("group", { name: "Línea 1" });
  await line.getByLabel("Descripción").fill("Revisión de caldera");
  await line.getByLabel("Precio (€)").fill("60");
  await page.getByRole("button", { name: "Guardar plantilla" }).click();

  const templates = page.getByRole("list", { name: "Plantillas" });
  await expect(templates).toContainText("Mantenimiento mensual");
  // 60 × 1,21 = 72,60 €
  await expect(templates).toContainText("Comunidad Sol · 1 línea · 72,60 €");

  // Usarla: la factura nueva llega rellena y se ajusta (doble cantidad) sin tocar la plantilla.
  await page.getByRole("link", { name: "Usar la plantilla Mantenimiento mensual" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nueva factura" })).toBeVisible();
  await expect(page.getByText("Desde la plantilla «Mantenimiento mensual»")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Cliente", exact: true })).toHaveValue("Comunidad Sol");
  await expect(line.getByLabel("Descripción")).toHaveValue("Revisión de caldera");
  await line.getByLabel("Cantidad").fill("2");
  await expect(page.getByRole("region", { name: "Totales" })).toContainText("145,20 €");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Factura (borrador)" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Factura" })).toContainText("Comunidad Sol");

  // Ese borrador, guardado a su vez como plantilla: hace falta un nombre, y no puede repetirse.
  await page.getByRole("link", { name: "Guardar como plantilla" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nueva plantilla" })).toBeVisible();
  await expect(line.getByLabel("Cantidad")).toHaveValue("2");
  await editor.getByLabel("Nombre de la plantilla").fill("mantenimiento MENSUAL");
  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  await expect(editor).toContainText("Ya tienes una plantilla con ese nombre.");
  await editor.getByLabel("Nombre de la plantilla").fill("Mantenimiento doble");
  await page.getByRole("button", { name: "Guardar plantilla" }).click();
  await expect(templates).toContainText("Comunidad Sol · 1 línea · 72,60 €");
  await expect(templates).toContainText("Comunidad Sol · 1 línea · 145,20 €");

  // Desde «Nueva factura» las plantillas están a un toque, por su nombre.
  await (await taxpayerSection(page, "Facturas")).click();
  await page.getByRole("main").getByRole("link", { name: "Nueva factura" }).click();
  await page.getByRole("navigation", { name: "Empezar desde una plantilla" }).getByRole("link", { name: "Mantenimiento doble" }).click();
  await expect(line.getByLabel("Cantidad")).toHaveValue("2");
  await expect(page.getByRole("region", { name: "Totales" })).toContainText("145,20 €");
});
