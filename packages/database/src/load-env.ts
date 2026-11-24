// Carga el .env de la RAÍZ del monorepo (los scripts se ejecutan con cwd = packages/database).
// Las variables ya presentes en el entorno (Docker, CI) tienen prioridad y no se sobrescriben.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
