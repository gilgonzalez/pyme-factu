-- FacturaLibre — Fase 4: facturación (clientes, productos, series, facturas y líneas).
-- Documentación: docs/decisions/ADR-007-invoice-calculation.md y docs/tenancy/rls-policies.md (Facturación).
-- Parte 1: DDL generado por 'prisma migrate diff' desde schema.prisma.

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'RECTIFYING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "nif" TEXT,
    "legal_name" TEXT NOT NULL,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country_code" CHAR(2) NOT NULL DEFAULT 'ES',
    "email" TEXT,
    "equivalence_surcharge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "tax_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_series" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "number" INTEGER,
    "issue_date" DATE,
    "operation_date" DATE,
    "equivalence_surcharge" BOOLEAN NOT NULL DEFAULT false,
    "withholding_percent" INTEGER NOT NULL DEFAULT 0,
    "taxable_base" BIGINT NOT NULL DEFAULT 0,
    "vat_total" BIGINT NOT NULL DEFAULT 0,
    "surcharge_total" BIGINT NOT NULL DEFAULT 0,
    "withholding_amount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "issuer_snapshot" JSONB,
    "customer_snapshot" JSONB,
    "rectifies_invoice_id" UUID,
    "rectification_reason" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "issued_by_user_id" UUID,
    "issued_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "tax_key" TEXT NOT NULL,
    "line_base" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_taxpayer_id_legal_name_idx" ON "customers"("taxpayer_id", "legal_name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_taxpayer_id_id_key" ON "customers"("taxpayer_id", "id");

-- CreateIndex
CREATE INDEX "products_taxpayer_id_name_idx" ON "products"("taxpayer_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_series_taxpayer_id_code_key" ON "invoice_series"("taxpayer_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_series_taxpayer_id_id_key" ON "invoice_series"("taxpayer_id", "id");

-- CreateIndex
CREATE INDEX "invoices_taxpayer_id_status_created_at_idx" ON "invoices"("taxpayer_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_taxpayer_id_id_key" ON "invoices"("taxpayer_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_series_id_number_key" ON "invoices"("series_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_position_key" ON "invoice_lines"("invoice_id", "position");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_taxpayer_id_series_id_fkey" FOREIGN KEY ("taxpayer_id", "series_id") REFERENCES "invoice_series"("taxpayer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_taxpayer_id_customer_id_fkey" FOREIGN KEY ("taxpayer_id", "customer_id") REFERENCES "customers"("taxpayer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_taxpayer_id_invoice_id_fkey" FOREIGN KEY ("taxpayer_id", "invoice_id") REFERENCES "invoices"("taxpayer_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 2: restricciones que Prisma no expresa
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "customers" ADD CONSTRAINT "customers_nif_format" CHECK ("nif" IS NULL OR "nif" ~ '^[0-9A-Z]{9}$');
ALTER TABLE "customers" ADD CONSTRAINT "customers_country_code_format" CHECK ("country_code" ~ '^[A-Z]{2}$');
CREATE UNIQUE INDEX "customers_taxpayer_id_nif_key" ON "customers" ("taxpayer_id", "nif") WHERE "nif" IS NOT NULL;

ALTER TABLE "products" ADD CONSTRAINT "products_tax_key" CHECK ("tax_key" IN ('VAT:2100', 'VAT:1000', 'VAT:400', 'VAT:0', 'EXEMPT'));
ALTER TABLE "products" ADD CONSTRAINT "products_unit_price_non_negative" CHECK ("unit_price" >= 0);

ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{0,14}$');
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_next_number_positive" CHECK ("next_number" >= 1);
-- Destino de la FK (taxpayer_id, series_id, kind): la serie debe ser del MISMO tipo que la factura.
CREATE UNIQUE INDEX "invoice_series_taxpayer_id_id_kind_key" ON "invoice_series" ("taxpayer_id", "id", "kind");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_series_kind_fkey"
  FOREIGN KEY ("taxpayer_id", "series_id", "kind") REFERENCES "invoice_series" ("taxpayer_id", "id", "kind") ON DELETE RESTRICT;

-- Borrador: sin número ni fecha de expedición. Emitida: siempre con número, fecha y momento de emisión.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_number_only_when_issued"
  CHECK (
    ("status" = 'DRAFT' AND "number" IS NULL AND "issue_date" IS NULL AND "issued_at" IS NULL)
    OR ("status" = 'ISSUED' AND "number" IS NOT NULL AND "issue_date" IS NOT NULL AND "issued_at" IS NOT NULL)
  );
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_number_positive" CHECK ("number" IS NULL OR "number" >= 1);
-- Rectificativa ⇔ factura rectificada + motivo.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rectification_consistent"
  CHECK (("kind" = 'RECTIFYING') = ("rectifies_invoice_id" IS NOT NULL AND "rectification_reason" IS NOT NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_withholding_range" CHECK ("withholding_percent" BETWEEN 0 AND 10000);
-- La factura rectificada es del MISMO contribuyente (FK compuesta; Prisma no la puede declarar).
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rectifies_fkey"
  FOREIGN KEY ("taxpayer_id", "rectifies_invoice_id") REFERENCES "invoices" ("taxpayer_id", "id") ON DELETE RESTRICT;

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_key" CHECK ("tax_key" IN ('VAT:2100', 'VAT:1000', 'VAT:400', 'VAT:0', 'EXEMPT'));
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_discount_range" CHECK ("discount_percent" BETWEEN 0 AND 10000);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_position_positive" CHECK ("position" >= 1);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_unit_price_non_negative" CHECK ("unit_price" >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 3: inmutabilidad de las facturas emitidas (R-11). Aplica a TODOS los roles.
-- Una factura emitida no se modifica ni se borra: se corrige con una rectificativa.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION app.reject_issued_invoice_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status = 'ISSUED' THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: una factura emitida no se modifica ni se borra; se rectifica'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "invoices_immutable_when_issued"
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION app.reject_issued_invoice_change();

-- SECURITY DEFINER: comprueba el estado de la factura sin depender de lo que RLS deje ver.
CREATE FUNCTION app.reject_issued_invoice_line_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_invoice_ids uuid[];
  BEGIN
    v_invoice_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.invoice_id]
      WHEN 'DELETE' THEN ARRAY[OLD.invoice_id]
      ELSE ARRAY[OLD.invoice_id, NEW.invoice_id]
    END;
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = ANY (v_invoice_ids) AND i.status = 'ISSUED') THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: las líneas de una factura emitida no se modifican'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "invoice_lines_immutable_when_issued"
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION app.reject_issued_invoice_line_change();

REVOKE ALL ON FUNCTION app.reject_issued_invoice_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_issued_invoice_line_change() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 4: permisos y RLS por contribuyente.
-- Leer: tenant autorizado + acceso al contribuyente. Escribir: acceso FULL al contribuyente.
-- Qué ROL puede hacer cada operación (borrador, emitir, rectificar) lo decide la aplicación (runInTenant).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON "customers", "products", "invoice_series", "invoices", "invoice_lines" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "customers", "products", "invoices", "invoice_lines" TO facturalibre_app;
-- Las series no se borran: sus números pueden estar en facturas emitidas.
GRANT SELECT, INSERT, UPDATE ON "invoice_series" TO facturalibre_app;

ALTER TABLE "customers"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines"  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'products', 'invoice_series', 'invoices', 'invoice_lines'] LOOP
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
