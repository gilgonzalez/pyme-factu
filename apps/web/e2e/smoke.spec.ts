import { expect, test } from "@playwright/test";

test("la página pública se muestra en español y advierte del estado del producto", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "FacturaLibre" })).toBeVisible();
  await expect(page.getByText("No está homologado ni certificado por la Agencia Tributaria.", { exact: false })).toBeVisible();
});

test("las respuestas incluyen cabeceras de seguridad", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();
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
