// Worker de FacturaLibre (Fase 1: esqueleto).
// Preparado: conexión con el rol facturalibre_worker, health check y cierre ordenado.
// NO implementado todavía: consumo del outbox, envíos a AEAT, reintentos (ver docs/architecture/overview.md).
import { createDatabaseClient, isDatabaseReachable, requireEnv } from "@facturalibre/database";
import { startHealthServer } from "./health-server";

const db = createDatabaseClient(requireEnv("WORKER_DATABASE_URL"), { maxConnections: 5 });
const health = await startHealthServer({
  port: Number(process.env["WORKER_HEALTH_PORT"] ?? "8081"),
  host: process.env["WORKER_HEALTH_HOST"] ?? "0.0.0.0",
  isDatabaseReachable: () => isDatabaseReachable(db),
});
console.log(JSON.stringify({ level: "info", msg: "worker iniciado", address: health.address() }));

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", msg: "worker deteniéndose", signal }));
  await health.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
