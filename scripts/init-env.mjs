// pnpm env:init — crea .env a partir de .env.example sustituyendo cada marcador "cambia-esto-…"
// por un secreto aleatorio. El mismo marcador recibe el mismo valor (p. ej. contraseña y su URL).
// Nunca sobrescribe un .env existente y nunca imprime los secretos.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = `${root}.env`;

if (existsSync(target)) {
  console.error(".env ya existe; no se modifica. Bórralo manualmente si quieres regenerarlo.");
  process.exit(1);
}

const secrets = new Map();
const content = readFileSync(`${root}.env.example`, "utf8").replace(/cambia-esto-[a-z0-9-]+/g, (placeholder) => {
  if (!secrets.has(placeholder)) secrets.set(placeholder, randomBytes(24).toString("hex"));
  return secrets.get(placeholder);
});

writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
console.log(`.env creado con ${secrets.size} secretos aleatorios.`);
