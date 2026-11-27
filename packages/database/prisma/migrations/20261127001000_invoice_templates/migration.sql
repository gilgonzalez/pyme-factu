-- Plantillas de factura: lo que se repite en las facturas de un contribuyente (cliente opcional, líneas,
-- retención, observaciones) con un nombre identificativo. Usar una plantilla rellena el editor de una factura
-- nueva; la plantilla no cambia. No guarda importes: se calculan al facturar (fiscal-core, ADR-007).
-- Permisos y RLS: los mismos que "invoices" / "invoice_lines" (docs/tenancy/rls-policies.md).

CREATE TABLE "invoice_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "customer_id" UUID,
    "withholding_percent" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_template_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "tax_key" TEXT NOT NULL,

    CONSTRAINT "invoice_template_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_templates_taxpayer_id_id_key" ON "invoice_templates"("taxpayer_id", "id");
-- Un nombre por contribuyente, sin distinguir mayúsculas («Mantenimiento» = «mantenimiento»).
CREATE UNIQUE INDEX "invoice_templates_taxpayer_id_name_key" ON "invoice_templates"("taxpayer_id", lower("name"));
CREATE UNIQUE INDEX "invoice_template_lines_template_id_position_key" ON "invoice_template_lines"("template_id", "position");

ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_tenant_id_taxpayer_id_fkey"
  FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Cliente del mismo contribuyente; si desapareciera, la plantilla se queda sin cliente (no se pierde).
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_customer_fkey"
  FOREIGN KEY ("taxpayer_id", "customer_id") REFERENCES "customers"("taxpayer_id", "id") ON DELETE SET NULL ("customer_id");
ALTER TABLE "invoice_template_lines" ADD CONSTRAINT "invoice_template_lines_tenant_id_taxpayer_id_fkey"
  FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_template_lines" ADD CONSTRAINT "invoice_template_lines_taxpayer_id_template_id_fkey"
  FOREIGN KEY ("taxpayer_id", "template_id") REFERENCES "invoice_templates"("taxpayer_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_templates"
  ADD CONSTRAINT "invoice_templates_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "invoice_templates_withholding_range" CHECK ("withholding_percent" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "invoice_templates_notes_length" CHECK (char_length("notes") <= 1000);
ALTER TABLE "invoice_template_lines"
  ADD CONSTRAINT "invoice_template_lines_tax_key"
    CHECK ("tax_key" IN ('VAT:2100', 'VAT:1000', 'VAT:400', 'VAT:0', 'EXEMPT:E1', 'EXEMPT:E4', 'EXEMPT:E6', 'EXEMPT')),
  ADD CONSTRAINT "invoice_template_lines_discount_range" CHECK ("discount_percent" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "invoice_template_lines_position_positive" CHECK ("position" >= 1),
  ADD CONSTRAINT "invoice_template_lines_unit_price_non_negative" CHECK ("unit_price" >= 0);

-- Permisos y RLS por contribuyente, como el resto de la facturación. Leer: acceso al contribuyente.
-- Escribir: acceso FULL. Qué ROL puede crear o borrar plantillas lo decide la aplicación (invoices.draft).
REVOKE ALL ON "invoice_templates", "invoice_template_lines" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "invoice_templates", "invoice_template_lines" TO facturalibre_app;

ALTER TABLE "invoice_templates"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_template_lines" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoice_templates', 'invoice_template_lines'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO facturalibre_app
         USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_access_taxpayer(taxpayer_id))',
      t || '_app_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO facturalibre_app
         WITH CHECK (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))',
      t || '_app_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO facturalibre_app
         USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))
         WITH CHECK (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))',
      t || '_app_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO facturalibre_app
         USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))',
      t || '_app_delete', t);
  END LOOP;
END
$$;
