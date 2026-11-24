// Arnés de base de datos para pruebas de integración. NUNCA se importa desde código de producción.
// Si existe TEST_DATABASE_URL (p. ej. servicio PostgreSQL en CI o Docker) se usa ese servidor;
// si no, se arranca un PostgreSQL 18 real y efímero con embedded-postgres.
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { ensureDatabaseRoles, roleConnectionUrl, type RolePasswords, type RuntimeRole } from "../bootstrap";
import { deployMigrations } from "../migrations";

export { FIXTURE, seedIsolationFixtures } from "./fixtures";

export interface TestDatabaseUrls {
  readonly owner: string;
  readonly app: string;
  readonly auth: string;
  readonly worker: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrls: TestDatabaseUrls;
  }
}

export interface TestDatabase {
  readonly urls: TestDatabaseUrls;
  stop(): Promise<void>;
}

const randomSecret = (): string => randomBytes(24).toString("hex");

/** Conexiones pg directas para pruebas (un rol por conexión); `closeAll` en afterAll. */
export function testClients(): { connect(url: string): Promise<pg.Client>; closeAll(): Promise<void> } {
  const clients: pg.Client[] = [];
  return {
    async connect(url) {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      clients.push(client);
      return client;
    },
    async closeAll() {
      await Promise.all(clients.map((client) => client.end()));
    },
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === "object") resolve(address.port);
        else reject(new Error("No se pudo obtener un puerto libre"));
      });
    });
  });
}

async function createFreshDatabase(adminUrl: string): Promise<string> {
  const name = `facturalibre_test_${randomBytes(6).toString("hex")}`;
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await client.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function prepare(adminServerUrl: string, stopServer: () => Promise<void>): Promise<TestDatabase> {
  try {
    const owner = await createFreshDatabase(adminServerUrl);
    const passwords: RolePasswords = { app: randomSecret(), auth: randomSecret(), worker: randomSecret() };
    await ensureDatabaseRoles(owner, passwords);
    deployMigrations(owner);
    const urlFor = (role: RuntimeRole): string => roleConnectionUrl(owner, role, passwords[role]);
    return { urls: { owner, app: urlFor("app"), auth: urlFor("auth"), worker: urlFor("worker") }, stop: stopServer };
  } catch (error) {
    await stopServer();
    throw error;
  }
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const external = process.env["TEST_DATABASE_URL"];
  if (external !== undefined && external !== "") {
    return prepare(external, () => Promise.resolve());
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = await freePort();
  const password = randomSecret();
  const server = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), "facturalibre-pg-")),
    port,
    user: "postgres",
    password,
    persistent: false,
    // En Windows initdb usaría WIN1252 por defecto; la aplicación exige UTF-8.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => undefined,
  });
  await server.initialise();
  await server.start();
  return prepare(`postgres://postgres:${password}@127.0.0.1:${port}/postgres`, () => server.stop());
}
