import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer, type HealthServer } from "../src/health-server";

let server: HealthServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function get(path: string, databaseOk: boolean): Promise<Response> {
  server = await startHealthServer({ port: 0, host: "127.0.0.1", isDatabaseReachable: () => Promise.resolve(databaseOk) });
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
}

describe("servidor de salud del worker", () => {
  it("responde 200 cuando la base de datos está disponible", async () => {
    const response = await get("/health", true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("responde 503 sin detalles internos cuando la base de datos no responde", async () => {
    const response = await get("/health", false);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded", checks: { database: "unavailable" } });
  });

  it("no expone ninguna otra ruta", async () => {
    const response = await get("/", true);
    expect(response.status).toBe(404);
  });
});
