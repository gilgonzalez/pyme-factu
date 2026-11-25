// Fases 4 y 5: facturar de principio a fin con navegador real — cliente, producto, borrador con totales en vivo,
// emisión con número correlativo y registro VERI*FACTU (QR tributario), inmutabilidad, rectificativa en su propia
// serie, anulación y cadena de registros comprobada. Datos ficticios.
import { readFile } from "node:fs/promises";
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

test("cliente, producto, borrador, emisión con QR, rectificativa, anulación y cadena", async ({ page }) => {
  // Recorrido largo (tres emisiones, una anulación y la cadena): más tiempo que el predeterminado de 30 s.
  test.setTimeout(120_000);
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
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Cliente Ficticio SL (B12345674)" });
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
  // QR tributario arriba, con su texto y la frase VERI*FACTU; y el registro de alta encadenado.
  const qr = page.getByRole("region", { name: "QR tributario" });
  await expect(qr).toContainText("QR tributario:");
  await expect(qr).toContainText("VERI*FACTU");
  await expect(qr.getByRole("img", { name: new RegExp(`Código QR tributario de la factura F${YEAR}-0001`) })).toBeVisible();
  await expect(qr.getByRole("link")).toHaveAttribute("href", new RegExp(String.raw`ValidarQR\?nif=12345678Z&numserie=F${YEAR}-0001&fecha=\d{2}-\d{2}-${YEAR}&importe=163\.96$`));
  await expect(page.getByRole("region", { name: "Registro VERI*FACTU" })).toContainText("Nº 1 de la cadena");
  // PDF de la factura emitida (con el QR): se descarga con su número como nombre.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`F${YEAR}-0001.pdf`);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  await page.goto(`${new URL(page.url()).pathname}/editar`);
  await expect(page.getByRole("heading", { level: 1, name: `Factura F${YEAR}-0001` })).toBeVisible();

  // Rectificativa por diferencias en su propia serie.
  // Rectificar y anular son acciones poco frecuentes: van plegadas y se abren para usarlas.
  await page.getByText("Corregir con una rectificativa").click();
  const rectify = page.getByRole("form", { name: "Rectificar la factura" });
  await rectify.getByLabel("Motivo de la rectificación").fill("Precio unitario incorrecto");
  await rectify.getByLabel("Tipo de rectificación").selectOption("R1");
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

  // Una factura expedida por error se anula: registro de anulación, sin QR y sin poder rectificarla.
  await page.getByRole("link", { name: "Nueva factura" }).click();
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Cliente Ficticio SL (B12345674)" });
  const duplicate = page.getByRole("group", { name: "Línea 1" });
  await duplicate.getByLabel("Descripción").fill("Factura duplicada por error");
  await duplicate.getByLabel("Precio (€)").fill("10");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.getByRole("form", { name: "Emitir la factura" }).getByRole("checkbox").check();
  await page.getByRole("form", { name: "Emitir la factura" }).getByRole("button", { name: "Emitir factura" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Factura F${YEAR}-0002` })).toBeVisible();
  await page.getByText("Anular: se expidió por error").click();
  const annul = page.getByRole("form", { name: "Anular la factura" });
  await annul.getByLabel("Por qué se anula").fill("Duplicada: no hubo venta");
  await annul.getByRole("checkbox").check();
  await annul.getByRole("button", { name: "Anular factura" }).click();
  await expect(page.getByText("Factura anulada")).toBeVisible();
  await expect(page.getByRole("region", { name: "QR tributario" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Rectificar la factura" })).toHaveCount(0);

  // Cadena: alta F, alta R, alta F2 y su anulación, comprobadas.
  await sections.getByRole("link", { name: "Registros VERI*FACTU" }).click();
  await expect(page.getByText("Cadena comprobada: las 4 huellas coinciden")).toBeVisible();
  const chain = page.getByRole("table");
  await expect(chain).toContainText("Alta (F1)");
  await expect(chain).toContainText("Alta (R1)");
  await expect(chain).toContainText("Anulación");
});
