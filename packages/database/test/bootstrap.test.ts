import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { createDatabaseClient, isDatabaseReachable, requireEnv } from "../src";
import { ensureDatabaseRoles, roleConnectionUrl } from "../src/bootstrap";
import "../src/testing";

const urls = inject("dbUrls");

async function canConnect(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe("ensureDatabaseRoles", () => {
  it("rechaza contraseñas de menos de 16 caracteres sin tocar la base de datos", async () => {
    await expect(ensureDatabaseRoles("postgres://invalid", { app: "corta", auth: "x".repeat(16), worker: "x".repeat(16) })).rejects.toThrow(
      /rol app .* 16 caracteres/,
    );
  });

  it("es idempotente: re-ejecutarlo con las mismas contraseñas deja los roles operativos", async () => {
    // Reutiliza las contraseñas del arnés para no alterar el estado que usan otras suites en paralelo.
    const password = (role: "app" | "auth" | "worker"): string => decodeURIComponent(new URL(urls[role]).password);
    const passwords = { app: password("app"), auth: password("auth"), worker: password("worker") };
    // Contra la base de datos `postgres`, como el arnés, para compartir su bloqueo (los bloqueos consultivos son por base de datos).
    const serverUrl = new URL(urls.owner);
    serverUrl.pathname = "/postgres";
    await ensureDatabaseRoles(serverUrl.toString(), passwords);
    await ensureDatabaseRoles(serverUrl.toString(), passwords);

    expect(await canConnect(roleConnectionUrl(urls.owner, "app", passwords.app))).toBe(true);
    expect(await canConnect(roleConnectionUrl(urls.owner, "worker", "contraseña-equivocada-123"))).toBe(false);
  });
});

describe("roleConnectionUrl", () => {
  it("sustituye usuario y contraseña (codificada) conservando servidor y base de datos", () => {
    const url = new URL(roleConnectionUrl("postgres://admin:secret@db.local:6543/facturalibre", "auth", "p@ss/word"));
    expect(url.username).toBe("facturalibre_auth");
    expect(decodeURIComponent(url.password)).toBe("p@ss/word");
    expect(url.host).toBe("db.local:6543");
    expect(url.pathname).toBe("/facturalibre");
  });
});

describe("requireEnv", () => {
  it("devuelve el valor presente", () => {
    expect(requireEnv("X", { X: "valor" })).toBe("valor");
  });

  it.each([undefined, "", "   "])("falla en el arranque si la variable falta o está vacía (%j)", (value) => {
    expect(() => requireEnv("X", value === undefined ? {} : { X: value })).toThrow("Falta la variable de entorno obligatoria X");
  });
});

describe("isDatabaseReachable", () => {
  it("es verdadero con una conexión válida", async () => {
    const db = createDatabaseClient(urls.app, { maxConnections: 1 });
    expect(await isDatabaseReachable(db)).toBe(true);
    await db.$disconnect();
  });

  it("es falso (sin lanzar) si la base de datos no es accesible", async () => {
    // Un puerto sin servidor: inaccesible sea cual sea la autenticación (en CI, PostgreSQL usa «trust»).
    const bad = new URL(urls.app);
    bad.port = "1";
    const db = createDatabaseClient(bad.toString(), { maxConnections: 1 });
    expect(await isDatabaseReachable(db)).toBe(false);
    await db.$disconnect();
  });
});
