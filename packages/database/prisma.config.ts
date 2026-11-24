// Configuración del CLI de Prisma 7. La URL es la del rol propietario/migrador (DATABASE_URL),
// nunca la del rol de aplicación: la aplicación se conecta con APP_DATABASE_URL (rol sin BYPASSRLS).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
