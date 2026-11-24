// Recorridos completos de la Fase 2 con navegador real contra el stack de docker compose
// (web + PostgreSQL + Mailpit). Datos ficticios y únicos por ejecución.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { linkFromEmail, uniqueEmail } from "./support/mailpit";

const PASSWORD = "una-frase-de-prueba-larga";

// Requiere PostgreSQL migrado, Mailpit y la web con APP_BASE_URL = baseURL de Playwright (ver docs/deployment/docker.md).
test.skip(process.env["E2E_FULL_STACK"] !== "1", "Recorridos completos desactivados: define E2E_FULL_STACK=1");

async function signUpAndVerify(page: Page, name: string, email: string, startAt = "/registro"): Promise<void> {
  await page.goto(startAt);
  await page.getByLabel("Nombre y apellidos").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("Revisa tu bandeja de entrada");
  await page.goto(await linkFromEmail(email, /Confirma tu email/));
}

async function createOrganization(page: Page, name: string): Promise<string> {
  await page.getByRole("link", { name: "Crear organización" }).click();
  await page.getByLabel("Nombre de la organización").fill(name);
  const slug = await page.getByLabel("Dirección").inputValue();
  await page.getByRole("button", { name: "Crear organización" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return slug;
}

async function newPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test("alta, organización, invitación y aceptación por una segunda persona", async ({ page, browser }) => {
  const ownerEmail = uniqueEmail("propietaria");
  const orgName = `Fontanería Ficticia ${Date.now().toString(36)}`;

  await signUpAndVerify(page, "Ana Ficticia", ownerEmail);
  await expect(page).toHaveURL(/\/organizaciones$/);
  await expect(page.getByText("Aún no perteneces a ninguna")).toBeVisible();

  const slug = await createOrganization(page, orgName);
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  await expect(page.getByLabel("Organización activa")).toHaveText(orgName);

  await page.getByRole("link", { name: "Equipo", exact: true }).click();
  const inviteeEmail = uniqueEmail("contable");
  const inviteForm = page.getByRole("form", { name: "Invitar a alguien" });
  await inviteForm.getByLabel("Email").fill(inviteeEmail);
  await inviteForm.getByLabel("Rol").selectOption("ACCOUNTANT");
  await inviteForm.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByRole("status")).toContainText(`Invitación enviada a ${inviteeEmail}`);
  await expect(page.getByRole("region", { name: "Invitaciones pendientes" }).getByText(inviteeEmail)).toBeVisible();

  // Segunda persona, sin cuenta: abre el enlace, se registra y vuelve a la invitación.
  const invitationUrl = await linkFromEmail(inviteeEmail, /te invita a/);
  const invitee = await newPage(browser);
  await invitee.goto(invitationUrl);
  await invitee.getByRole("link", { name: "Crear cuenta" }).click();
  await invitee.waitForURL(/\/registro\?volver=%2Finvitacion%2F/);
  await signUpAndVerify(invitee, "Carlos Ficticio", inviteeEmail, invitee.url());
  await expect(invitee.getByText(`Te han invitado a ${orgName}`)).toBeVisible();
  await invitee.getByRole("button", { name: "Aceptar y entrar" }).click();
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
  const slug = await createOrganization(page, `Gestoría Ficticia ${Date.now().toString(36)}`);

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
