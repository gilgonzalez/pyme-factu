// Configuración de la empresa: contacto, logo, cobro y valores por defecto, y cómo llegan a borradores y facturas.
// Datos ficticios; IBAN de ejemplo con control válido.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createOrganization, requireFullStack, signUpAndVerify, taxpayerSection } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

/** PNG de 1 × 1 píxel. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("la configuración de la empresa se usa en los borradores y facturas", async ({ page }) => {
  test.setTimeout(90_000);
  await signUpAndVerify(page, "Ana Ficticia", uniqueEmail("empresa"));
  await createOrganization(page, `Empresa Ficticia ${uniqueSuffix()}`);
  await page.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const newTaxpayer = page.getByRole("form", { name: "Nuevo contribuyente" });
  await newTaxpayer.getByLabel("NIF").fill("B12345674");
  await newTaxpayer.getByLabel("Nombre y apellidos o razón social").fill("Fontanería Ficticia SL");
  await newTaxpayer.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fontanería Ficticia SL" })).toBeVisible();
  await expect(await taxpayerSection(page, "Empresa")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape"); // en el móvil, cierra «Más»

  // Contacto y datos registrales.
  const details = page.getByRole("form", { name: "Datos del contribuyente" });
  await details.getByLabel("Teléfono (opcional)").fill("600 123 456");
  await details.getByLabel("Web (opcional)").fill("fontaneria.example");
  await details.getByLabel("Datos registrales (opcional)").fill("Inscrita en el Registro Mercantil de Madrid, tomo 1, folio 2, hoja M-3");
  await details.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(details.getByRole("status")).toContainText("Datos guardados");

  // Logo: un fichero que no es imagen se rechaza; un PNG se guarda y se ve.
  const logo = page.getByRole("form", { name: "Subir logo" });
  await logo.getByLabel("Sube tu logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("no soy una imagen") });
  await logo.getByRole("button", { name: "Subir logo" }).click();
  await expect(logo.getByText("El logo tiene que ser una imagen PNG o JPEG.")).toBeVisible();
  await logo.getByLabel("Sube tu logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await logo.getByRole("button", { name: "Subir logo" }).click();
  await expect(page.getByRole("img", { name: "Logo actual de la empresa" })).toBeVisible();

  // Cobro y valores por defecto: el IBAN se valida y se guarda agrupado.
  const billing = page.getByRole("form", { name: "Cobro y facturas" });
  await billing.getByLabel("IBAN para transferencias (opcional)").fill("ES91 2100 0418 4502 0005 1333");
  await billing.getByLabel("Plazo de pago (días)").fill("30");
  await billing.getByLabel("Retención IRPF % (opcional)").fill("15");
  await billing.getByLabel("IVA de las líneas nuevas").selectOption("VAT:1000");
  await billing.getByLabel("Pie de factura (opcional)").fill("Gracias por su confianza.");
  await billing.getByLabel("Mensaje al enviar por email (opcional)").fill("Te adjunto el documento.");
  await billing.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(billing.getByText("El IBAN no es válido: revisa las cifras (no cuadran los dígitos de control).")).toBeVisible();
  await expect(billing.getByLabel("Plazo de pago (días)")).toHaveValue("30");
  await billing.getByLabel("IBAN para transferencias (opcional)").fill("es91 2100 0418 4502 0005 1332");
  await billing.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(billing.getByRole("status")).toContainText("Configuración guardada");
  await page.reload();
  await expect(page.getByRole("form", { name: "Cobro y facturas" }).getByLabel("IBAN para transferencias (opcional)")).toHaveValue("ES91 2100 0418 4502 0005 1332");
  await expect(page.getByRole("form", { name: "Cobro y facturas" }).getByLabel("IVA de las líneas nuevas")).toHaveValue("VAT:1000");

  // Un cliente con email.
  await (await taxpayerSection(page, "Clientes")).click();
  const customer = page.getByRole("form", { name: "Nuevo cliente" });
  await customer.getByLabel("Nombre y apellidos o razón social").fill("Cliente Ficticio SL");
  await customer.getByLabel("Email de facturación (opcional)").fill("compras@cliente.example");
  await customer.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("list", { name: "Clientes" })).toContainText("Cliente Ficticio SL");

  // La factura nueva empieza con la retención y el IVA configurados.
  await (await taxpayerSection(page, "Borradores")).click();
  await page.getByRole("link", { name: "Nuevo borrador" }).click();
  await expect(page.getByLabel("Retención IRPF % (opcional)")).toHaveValue("15");
  const line = page.getByRole("group", { name: "Línea 1" });
  await expect(line.getByLabel("IVA")).toHaveValue("VAT:1000");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).fill("cliente");
  await page.getByRole("option", { name: /Cliente Ficticio SL/ }).click();
  await line.getByLabel("Descripción").fill("Reparación");
  await line.getByLabel("Precio (€)").fill("100");
  // 100 + 10 % IVA − 15 % IRPF = 95,00 €
  await expect(page.getByRole("region", { name: "Totales" })).toContainText("95,00 €");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Factura (borrador)" })).toBeVisible();

  // En el documento: contacto, forma de pago con vencimiento y textos legales.
  const invoice = page.getByRole("article", { name: "Factura" });
  await expect(invoice).toContainText("Tel. 600 123 456");
  await expect(invoice).toContainText("fontaneria.example");
  const payment = invoice.getByRole("region", { name: "Forma de pago" });
  await expect(payment).toContainText("Transferencia bancaria a ES91 2100 0418 4502 0005 1332");
  await expect(payment).toContainText(/Vencimiento: \d{2}\/\d{2}\/\d{4}/);
  await expect(invoice).toContainText("Inscrita en el Registro Mercantil de Madrid, tomo 1, folio 2, hoja M-3");
  await expect(invoice).toContainText("Gracias por su confianza.");
  // El envío propone el mensaje configurado.
  await expect(page.getByRole("form", { name: "Enviar el borrador al cliente" }).getByLabel("Mensaje (opcional)")).toHaveValue("Te adjunto el documento.");

  // El PDF se genera con el logo.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar borrador (PDF)" }).click();
  const pdf = await readFile(await (await downloading).path());
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(pdf.toString("latin1")).toContain("/Subtype /Image");
});
