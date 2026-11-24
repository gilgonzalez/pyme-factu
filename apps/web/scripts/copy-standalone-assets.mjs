// Tras `next build` con output: "standalone", Next no copia public/ ni .next/static/ (docs de Next 16,
// next.config.js › output). Este paso los copia para que `server.js` los sirva (local y Docker).
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const target = `${app}.next/standalone/apps/web`;

cpSync(`${app}.next/static`, `${target}/.next/static`, { recursive: true });
if (existsSync(`${app}public`)) cpSync(`${app}public`, `${target}/public`, { recursive: true });
console.log("Recursos estáticos copiados a .next/standalone/apps/web");
