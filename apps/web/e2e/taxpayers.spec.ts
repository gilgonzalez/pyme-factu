// Fase 3: contribuyentes (alta con NIF validado) y acceso por contribuyente, con navegador real.
// NIF ficticios calculados con los algoritmos oficiales.
import { expect, test } from "@playwright/test";
import { acceptAsNewUser, createOrganization, invite, newPage, requireFullStack, signUpAndVerify } from "./support/flows";
import { uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

test("alta de un contribuyente y acceso de solo lectura para un empleado con alcance asignado", async ({ page, browser }) => {
  await signUpAndVerify(page, "Ana Ficticia", uniqueEmail("propietaria"));
  const slug = await createOrganization(page, `Gestoría Ficticia ${uniqueSuffix()}`);

  // Alta con un NIF de control erróneo: el error se explica junto al campo.
  await page.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  const form = page.getByRole("form", { name: "Nuevo contribuyente" });
  await form.getByLabel("NIF").fill("B12345675");
  await form.getByLabel("Nombre y apellidos o razón social").fill("Fontanería Ficticia SL");
  // Lo opcional está plegado: se abre para escribir el código postal (la provincia se rellena sola).
  await form.getByRole("button", { name: "Añadir contacto, dirección y datos registrales" }).click();
  await form.getByLabel("Código postal (opcional)").fill("28001");
  await expect(form.getByLabel("Provincia (opcional)")).toHaveValue("Madrid");
  await form.getByRole("button", { name: "Dar de alta" }).click();
  await expect(form.getByText("El NIF no es válido: revisa el último carácter (control).")).toBeVisible();
  // Lo ya escrito se conserva tras el error.
  await expect(form.getByLabel("Nombre y apellidos o razón social")).toHaveValue("Fontanería Ficticia SL");
  await expect(form.getByLabel("Código postal (opcional)")).toHaveValue("28001");

  await form.getByLabel("NIF").fill("b-1234567-4");
  await form.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fontanería Ficticia SL" })).toBeVisible();
  await expect(page.getByLabel("Contribuyente activo")).toContainText("NIF B12345674");
  const taxpayerUrl = page.url();

  // Empleado con alcance «solo los asignados»: no ve nada hasta que se le da acceso.
  const employeeEmail = uniqueEmail("empleado");
  const invitationUrl = await invite(page, employeeEmail, "EMPLOYEE", "ASSIGNED_TAXPAYERS");
  const employee = await newPage(browser);
  await acceptAsNewUser(employee, invitationUrl, "Eva Ficticia", employeeEmail);
  await employee.getByRole("link", { name: "Contribuyentes", exact: true }).click();
  await expect(employee.getByText("Todavía no hay contribuyentes a los que tengas acceso.")).toBeVisible();
  await employee.goto(taxpayerUrl);
  await expect(employee.getByRole("heading", { level: 1, name: "No hemos encontrado esta página" })).toBeVisible();

  // La propietaria le da acceso de solo lectura.
  await page.goto(taxpayerUrl);
  const access = page.getByRole("form", { name: "Acceso de Eva Ficticia" });
  await access.getByLabel("Acceso").selectOption("READ_ONLY");
  await access.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status")).toContainText("Acceso actualizado");

  // Ahora lo ve, en solo lectura y sin formulario de edición.
  await employee.goto(`/${slug}/contribuyentes`);
  await expect(employee.getByRole("list", { name: "Contribuyentes" })).toContainText("Solo lectura");
  await employee.getByRole("link", { name: /Fontanería Ficticia SL/ }).click();
  await expect(employee.getByLabel("Contribuyente activo")).toContainText("Fontanería Ficticia SL");
  await expect(employee.getByRole("form", { name: "Datos del contribuyente" })).toHaveCount(0);
  await expect(employee.getByRole("form", { name: "Cobro y facturas" })).toHaveCount(0);
  await expect(employee.getByRole("form", { name: "Subir logo" })).toHaveCount(0);
  await expect(employee.getByText("tu acceso: solo lectura")).toBeVisible();
});
