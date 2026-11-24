// Fase 4: facturar de principio a fin con navegador real — cliente, producto, borrador con totales en vivo,
// emisión con número correlativo, inmutabilidad y rectificativa en su propia serie. Datos ficticios.
import { expect, test, type Page } from "@playwright/test";
import { createOrganization, requireFullStack, signUpAndVerify } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

const YEAR = new Date().toLocaleString("en-CA", { timeZone: "Europe/Madrid", year: "numeric" });

async function createTaxpayer(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo contribuyente" });
  await form.getByLabel("NIF").fill("12345678Z");
  await form.getByLabel("Nombre y apellidos o razón social").fill("Ana Ficticia Pérez");
  await form.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ana Ficticia Pérez" })).toBeVisible();
}

test("cliente, producto, borrador, emisión y rectificativa", async ({ page }) => {
  await signUpAndVerify(page, "Ana Ficticia", uniqueEmail("autonoma"));
  await createOrganization(page, `Fontanería Ficticia ${uniqueSuffix()}`);
  await createTaxpayer(page);
  const sections = page.getByRole("navigation", { name: "Secciones del contribuyente" });

  // Cliente y producto.
  await sections.getByRole("link", { name: "Clientes" }).click();
  const customer = page.getByRole("form", { name: "Nuevo cliente" });
  await customer.getByLabel("NIF (opcional)").fill("B12345674");
  await customer.getByLabel("Nombre y apellidos o razón social").fill("Cliente Ficticio SL");
  await customer.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("list", { name: "Clientes" })).toContainText("Cliente Ficticio SL");

  await sections.getByRole("link", { name: "Productos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Productos y servicios" })).toBeVisible();
  const product = page.getByRole("form", { name: "Nuevo producto" });
  await product.getByLabel("Nombre").fill("Hora de trabajo");
  await product.getByLabel("Precio sin IVA (€)").fill("35,50");
  await product.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("list", { name: "Productos" })).toContainText("Hora de trabajo");

  // Borrador: totales en vivo con el mismo cálculo que el servidor.
  await sections.getByRole("link", { name: "Facturas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Facturas" })).toBeVisible();
  await page.getByRole("link", { name: "Nueva factura" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nueva factura" })).toBeVisible();
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Cliente Ficticio SL (B12345674)" });
  const first = page.getByRole("group", { name: "Línea 1" });
  await first.getByLabel("Descripción").fill("Reparación de caldera");
  await first.getByLabel("Cantidad").fill("2");
  await first.getByLabel("Precio (€)").fill("50");
  await page.getByLabel("Añadir un producto guardado").selectOption({ label: "Hora de trabajo · 35,5 €" });
  await expect(page.getByRole("group", { name: "Línea 2" }).getByLabel("Descripción")).toHaveValue("Hora de trabajo");
  // (100 + 35,50) × 1,21 = 163,955 → 163,96 €
  await expect(page.getByRole("region", { name: "Totales" })).toContainText("163,96 €");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Factura (borrador)" })).toBeVisible();

  // Emisión: número correlativo de la serie del año; después, inalterable.
  const issue = page.getByRole("form", { name: "Emitir la factura" });
  await issue.getByRole("checkbox").check();
  await issue.getByRole("button", { name: "Emitir factura" }).click();
  await expect(page.getByRole("status")).toContainText(`Factura F${YEAR}-0001 emitida`);
  await expect(page.getByRole("heading", { level: 1, name: `Factura F${YEAR}-0001` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar borrador" })).toHaveCount(0);
  await page.goto(`${new URL(page.url()).pathname}/editar`);
  await expect(page.getByRole("heading", { level: 1, name: `Factura F${YEAR}-0001` })).toBeVisible();

  // Rectificativa por diferencias en su propia serie.
  const rectify = page.getByRole("form", { name: "Rectificar la factura" });
  await rectify.getByLabel("Motivo de la rectificación").fill("Precio unitario incorrecto");
  await rectify.getByRole("button", { name: "Preparar factura rectificativa" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Editar rectificativa" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Totales" })).toContainText("-163,96 €");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText(`Rectifica la factura F${YEAR}-0001`)).toBeVisible();
  const issueCorrection = page.getByRole("form", { name: "Emitir la factura" });
  await issueCorrection.getByRole("checkbox").check();
  await issueCorrection.getByRole("button", { name: "Emitir factura" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Factura rectificativa R${YEAR}-0001` })).toBeVisible();

  // Listado: las dos facturas, con su número.
  await sections.getByRole("link", { name: "Facturas" }).click();
  const table = page.getByRole("table");
  await expect(table).toContainText(`F${YEAR}-0001`);
  await expect(table).toContainText(`R${YEAR}-0001`);
  await expect(table).toContainText("-163,96 €");
});
