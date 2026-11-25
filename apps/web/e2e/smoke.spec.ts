import { expect, test } from "@playwright/test";

test("la página pública se muestra en español y advierte del estado del producto", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Facturas con VERI*FACTU, sin pagar por ello." })).toBeVisible();
  // Advierte de que aún no sirve para facturar de verdad y de que no hay «homologación» de la AEAT.
  const warning = page.getByText("todavía no sirve para facturar de verdad", { exact: false });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Ningún programa está «homologado» por la AEAT");
});

test("las respuestas incluyen cabeceras de seguridad", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
  // CSP (Fase 7): nada de terceros, ni objetos, ni marcos, ni formularios hacia fuera; imágenes data: para el QR.
  const csp = headers["content-security-policy"] ?? "";
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "img-src 'self' data:"]) {
    expect(csp).toContain(directive);
  }
});

test("el health check informa del estado de la base de datos sin detalles internos", async ({ request }) => {
  const response = await request.get("/api/health");
  const expectDatabase = process.env["E2E_EXPECT_DATABASE"] === "1";
  expect(response.status()).toBe(expectDatabase ? 200 : 503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual(
    expectDatabase
      ? { status: "ok", checks: { database: "ok" } }
      : { status: "degraded", checks: { database: "unavailable" } },
  );
});
