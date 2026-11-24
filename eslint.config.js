// Configuración ESLint compartida para paquetes y worker (la app web tiene la suya, basada en eslint-config-next).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/generated/**", "**/coverage/**", "**/node_modules/**", "apps/web/**", "reports/**", ".stryker-tmp/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Política de acceso a datos: nadie fuera de @facturalibre/database importa el cliente Prisma generado.
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/generated/prisma/**"], message: "Usa @facturalibre/database o withTenantContext de @facturalibre/tenancy." }] },
      ],
    },
  },
  {
    files: ["packages/database/src/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.config.{js,ts,mjs}", "eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
