// Flujos de identidad completos vía HTTP (como los usa el navegador) contra PostgreSQL real,
// con el rol facturalibre_auth y un buzón en memoria en lugar de SMTP.
import type {} from "@facturalibre/database/testing";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createAuth, type Auth, type Mailer, type OutgoingEmail } from "../src";

const urls = inject("dbUrls");
const BASE_URL = "http://localhost:3000";

class Inbox implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
    return Promise.resolve();
  }
  /** Último enlace de la aplicación enviado a `to`. */
  lastLink(to: string): string {
    const email = this.sent.findLast((candidate) => candidate.to === to);
    const link = email?.text.match(/https?:\/\/\S+/)?.[0];
    if (link === undefined) throw new Error(`Sin enlace para ${to}`);
    return link;
  }
}

let auth: Auth;
let closeAuth: () => Promise<void>;
const inbox = new Inbox();
let owner: pg.Client;

const PASSWORD = "contraseña-de-prueba-1";

function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const get = (url: string): Promise<Response> => auth.handler(new Request(url, { headers: { origin: BASE_URL } }));
const newEmail = (): string => `persona-${randomUUID().slice(0, 8)}@example.test`;

async function signUpAndVerify(email: string): Promise<void> {
  await post("/sign-up/email", { name: "Persona Ficticia", email, password: PASSWORD });
  await get(inbox.lastLink(email));
}

beforeAll(async () => {
  ({ auth, close: closeAuth } = createAuth({
    databaseUrl: urls.auth,
    baseURL: BASE_URL,
    secret: "secreto-de-pruebas-con-longitud-suficiente-32+",
    mailer: inbox,
    rateLimit: { enabled: true },
  }));
  owner = new pg.Client({ connectionString: urls.owner });
  await owner.connect();
});
afterAll(async () => {
  await closeAuth();
  await owner.end();
});

describe("registro y verificación de email", () => {
  it("el registro envía un email de verificación en español y no abre sesión", async () => {
    const email = newEmail();
    const response = await post("/sign-up/email", { name: "Persona Ficticia", email, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]+/);
    const message = inbox.sent.findLast((candidate) => candidate.to === email);
    expect(message?.subject).toMatch(/confirma tu email/i);
    expect(message?.html).toContain(inbox.lastLink(email).replaceAll("&", "&amp;"));
  });

  it("no se puede iniciar sesión sin verificar el email", async () => {
    const email = newEmail();
    await post("/sign-up/email", { name: "Persona Ficticia", email, password: PASSWORD });
    const response = await post("/sign-in/email", { email, password: PASSWORD });
    expect(response.status).toBe(403);
  });

  it("tras verificar, el inicio de sesión crea una sesión con cookie segura", async () => {
    const email = newEmail();
    await signUpAndVerify(email);
    const response = await post("/sign-in/email", { email, password: PASSWORD });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("una cuenta desactivada por su titular no puede iniciar sesión (Fase 7)", async () => {
    const email = newEmail();
    await signUpAndVerify(email);
    // Como hace app.deactivate_my_account(): marca la cuenta y cierra sus sesiones (la verificación abrió una).
    await owner.query("UPDATE users SET deactivated_at = now() WHERE email = $1", [email]);
    await owner.query("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)", [email]);
    const response = await post("/sign-in/email", { email, password: PASSWORD }, { "x-forwarded-for": "10.77.0.1" });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]+/);
    const sessions = await owner.query("SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1", [email]);
    expect(sessions.rowCount).toBe(0);
  });

  it("guarda el email en minúsculas (restricción de la base de datos)", async () => {
    const email = newEmail();
    const response = await post("/sign-up/email", { name: "Persona Ficticia", email: email.toUpperCase(), password: PASSWORD });
    expect(response.status).toBe(200);
    const row = await owner.query("SELECT email FROM users WHERE email = $1", [email]);
    expect(row.rows).toEqual([{ email }]);
  });

  it("rechaza contraseñas de menos de 8 caracteres y acepta las de 8", async () => {
    expect((await post("/sign-up/email", { name: "Persona Ficticia", email: newEmail(), password: "corta12" })).status).toBe(400);
    expect((await post("/sign-up/email", { name: "Persona Ficticia", email: newEmail(), password: "test1234" })).status).toBe(200);
  });

  it("la contraseña se guarda como hash, nunca en claro", async () => {
    const email = newEmail();
    await post("/sign-up/email", { name: "Persona Ficticia", email, password: PASSWORD });
    const row = await owner.query<{ password: string }>(
      "SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1",
      [email],
    );
    expect(row.rows[0]?.password).toBeTruthy();
    expect(row.rows[0]?.password).not.toContain(PASSWORD);
  });
});

describe("recuperación de contraseña", () => {
  it("restablece la contraseña con el enlace del email y cierra las sesiones abiertas", async () => {
    const email = newEmail();
    await signUpAndVerify(email);
    const signIn = await post("/sign-in/email", { email, password: PASSWORD });
    const sessionCookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    expect((await post("/request-password-reset", { email, redirectTo: "/restablecer-contrasena" })).status).toBe(200);
    const message = inbox.sent.findLast((candidate) => candidate.to === email);
    expect(message?.subject).toMatch(/restablece tu contraseña/i);
    const token = new URL(inbox.lastLink(email)).pathname.split("/").at(-1) ?? "";

    const newPassword = "otra-contraseña-segura-2";
    expect((await post("/reset-password", { token, newPassword })).status).toBe(200);

    expect((await post("/sign-in/email", { email, password: PASSWORD })).status).toBe(401);
    expect((await post("/sign-in/email", { email, password: newPassword })).status).toBe(200);
    const session = await auth.handler(new Request(`${BASE_URL}/api/auth/get-session`, { headers: { cookie: sessionCookie } }));
    expect(await session.json()).toBeNull();
  });

  it("no revela si un email está registrado", async () => {
    const before = inbox.sent.length;
    const response = await post("/request-password-reset", { email: newEmail(), redirectTo: "/restablecer-contrasena" });
    expect(response.status).toBe(200);
    expect(inbox.sent.length).toBe(before);
  });
});

describe("protecciones", () => {
  it("limita los intentos de inicio de sesión por IP (rate limiting persistente)", async () => {
    const headers = { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await post("/sign-in/email", { email: newEmail(), password: "incorrecta-12345" }, headers)).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    const stored = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM rate_limits");
    expect(stored.rows[0]?.n).toBeGreaterThan(0);
  });

  it("rechaza peticiones con un Origin no confiable (CSRF)", async () => {
    const response = await post("/sign-up/email", { name: "X", email: newEmail(), password: PASSWORD }, { origin: "https://atacante.example" });
    expect(response.status).toBe(403);
  });
});
