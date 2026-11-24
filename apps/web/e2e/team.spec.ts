// Recorridos completos de la Fase 2 con navegador real contra el stack de docker compose
// (web + PostgreSQL + Mailpit). Datos ficticios y únicos por ejecución.
import { expect, test } from "@playwright/test";
import { acceptAsNewUser, createOrganization, invite, newPage, requireFullStack, signUpAndVerify } from "./support/flows";
import { linkFromEmail, uniqueEmail, uniqueSuffix } from "./support/mailpit";

requireFullStack();

test("alta, organización, invitación y aceptación por una segunda persona", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("propietaria");
  const orgName = `Fontanería Ficticia ${uniqueSuffix()}`;

  await signUpAndVerify(page, "Ana Ficticia", ownerEmail);
  await expect(page).toHaveURL(/\/organizaciones$/);
  await expect(page.getByText("Aún no perteneces a ninguna")).toBeVisible();

  const slug = await createOrganization(page, orgName);
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  await expect(page.getByLabel("Organización activa")).toHaveText(orgName);

  const inviteeEmail = uniqueEmail("contable");
  const invitationUrl = await invite(page, inviteeEmail, "ACCOUNTANT", "ALL_TAXPAYERS");
  await expect(page.getByRole("region", { name: "Invitaciones pendientes" }).getByText(inviteeEmail)).toBeVisible();

  // Segunda persona, sin cuenta: abre el enlace, se registra, vuelve a la invitación y la acepta.
  const invitee = await newPage(browser);
  await acceptAsNewUser(invitee, invitationUrl, "Carlos Ficticio", inviteeEmail);
  await expect(invitee).toHaveURL(new RegExp(`/${slug}$`));
  await expect(invitee.getByRole("banner").getByText("Contable", { exact: true })).toBeVisible();

  // La contable ve el equipo pero no puede invitar.
  await invitee.getByRole("link", { name: "Equipo", exact: true }).click();
  await expect(invitee.getByRole("region", { name: "Miembros (2)" })).toBeVisible();
  await expect(invitee.getByRole("form", { name: "Invitar a alguien" })).toHaveCount(0);

  // La propietaria cambia su rol y la ve en la lista.
  await page.reload();
  await page.getByRole("form", { name: "Cambiar rol de Carlos Ficticio" }).getByLabel("Rol").selectOption("VIEWER");
  await page.getByRole("form", { name: "Cambiar rol de Carlos Ficticio" }).getByRole("button", { name: "Cambiar rol" }).click();
  await expect(page.getByRole("status")).toContainText("Rol cambiado a Solo lectura");
});

test("una organización ajena responde 404 aunque se conozca su dirección", async ({ page, browser }) => {
  await signUpAndVerify(page, "Bea Ficticia", uniqueEmail("bea"));
  const slug = await createOrganization(page, `Gestoría Ficticia ${uniqueSuffix()}`);

  const stranger = await newPage(browser);
  await signUpAndVerify(stranger, "Intrusa Ficticia", uniqueEmail("intrusa"));
  await stranger.goto(`/${slug}/equipo`);
  await expect(stranger.getByRole("heading", { level: 1, name: "No hemos encontrado esta página" })).toBeVisible();
  await expect(stranger.getByText("Gestoría Ficticia")).toHaveCount(0);
});

test("recuperar la contraseña y entrar con la nueva", async ({ page, baseURL }) => {
  const email = uniqueEmail("olvidadiza");
  await signUpAndVerify(page, "Olga Ficticia", email);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/entrar/);

  await page.getByRole("link", { name: "¿Has olvidado tu contraseña?" }).click();
  await page.getByLabel("Email de tu cuenta").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("recibirás un enlace");

  await page.goto(await linkFromEmail(email, /Restablece tu contraseña/));
  await page.getByLabel("Contraseña nueva").fill("otra-frase-de-prueba-larga");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText("Contraseña cambiada");

  await page.goto("/entrar?volver=https://atacante.example/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("otra-frase-de-prueba-larga");
  await page.getByRole("button", { name: "Entrar" }).click();
  // El destino externo se descarta: se vuelve a una ruta interna.
  await expect(page).toHaveURL(new URL("/organizaciones", baseURL).toString());
});

test("sin sesión, las páginas privadas llevan a iniciar sesión y vuelven después", async ({ page }) => {
  await page.goto("/organizaciones");
  await expect(page).toHaveURL(/\/entrar\?volver=%2Forganizaciones/);
  await expect(page.getByRole("heading", { level: 1, name: "Inicia sesión" })).toBeVisible();
});
