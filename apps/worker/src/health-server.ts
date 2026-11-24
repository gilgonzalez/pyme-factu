import { createServer, type Server } from "node:http";

export interface HealthServerOptions {
  readonly port: number;
  readonly host: string;
  readonly isDatabaseReachable: () => Promise<boolean>;
}

export interface HealthServer {
  address: Server["address"];
  close(): Promise<void>;
}

/** Servidor HTTP mínimo: solo GET /health, sin detalles internos. */
export function startHealthServer(options: HealthServerOptions): Promise<HealthServer> {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    void options.isDatabaseReachable().then((ok) => {
      const body = { status: ok ? "ok" : "degraded", checks: { database: ok ? "ok" : "unavailable" } };
      response.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    });
  });
  return new Promise((resolve) => {
    server.listen(options.port, options.host, () => {
      resolve({
        address: () => server.address(),
        close: () =>
          new Promise((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}
