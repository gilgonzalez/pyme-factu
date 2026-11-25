// Worker de FacturaLibre: health check, remisión periódica de registros VERI*FACTU (Fase 6) y cierre ordenado.
// FACTURALIBRE_ENV decide a dónde se envía: producción o pruebas de la AEAT, o el simulador local (R-19).
import { createSimulator, parseKek, simulatorTransport } from "@facturalibre/aeat-client";
import { createDatabaseClient, isDatabaseReachable, requireEnv } from "@facturalibre/database";
import { startHealthServer } from "./health-server";
import { runSubmissionCycle, transportResolver } from "./submitter";

const db = createDatabaseClient(requireEnv("WORKER_DATABASE_URL"), { maxConnections: 5 });
const environment = process.env["FACTURALIBRE_ENV"];
const kekValue = environment === "production" ? requireEnv("CERTIFICATE_KEK").trim() : process.env["CERTIFICATE_KEK"]?.trim();
// Si se configura, debe ser válida: mejor no arrancar que fallar en cada envío.
const kek = kekValue === undefined || kekValue === "" ? null : parseKek(kekValue);
const resolveTransport = transportResolver(db, environment, kek, simulatorTransport(createSimulator()));
const pollMilliseconds = Number(process.env["WORKER_POLL_SECONDS"] ?? "15") * 1000;

const log = (level: "info" | "error", msg: string, extra: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ level, msg, ...extra }));
};

const health = await startHealthServer({
  // PORT: el que asignan plataformas como Railway, donde se comprueba el health check.
  port: Number(process.env["WORKER_HEALTH_PORT"] ?? process.env["PORT"] ?? "8081"),
  host: process.env["WORKER_HEALTH_HOST"] ?? "0.0.0.0",
  isDatabaseReachable: () => isDatabaseReachable(db),
});
log("info", "worker iniciado", { address: health.address(), environment: environment ?? "development" });

let running: Promise<void> = Promise.resolve();
const cycle = (): void => {
  // Un ciclo no empieza hasta que termina el anterior.
  running = running.then(async () => {
    try {
      const processed = await runSubmissionCycle(db, resolveTransport);
      if (processed > 0) log("info", "remisión AEAT", { facturaciones: processed });
    } catch (error) {
      // Sin datos personales ni XML en el log: solo el mensaje.
      log("error", "ciclo de remisión fallido", { error: error instanceof Error ? error.message : "desconocido" });
    }
  });
};
const timer = setInterval(cycle, pollMilliseconds);
cycle();

async function shutdown(signal: string): Promise<void> {
  log("info", "worker deteniéndose", { signal });
  clearInterval(timer);
  await running;
  await health.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
