-- Fase 5: VERI*FACTU. Una «facturación» (SIF virtual) por contribuyente y su cadena de registros de alta y
-- anulación (OM HAC/1177/2024, arts. 2, 7, 10, 11 y 13). Decisiones: ADR-004 y ADR-008.
-- Parte 1 generada con `prisma migrate diff`; el resto (restricciones, triggers, RLS) a mano.

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 1: tablas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "BillingRecordKind" AS ENUM ('ALTA', 'ANULACION');
CREATE TYPE "BillingRecordStatus" AS ENUM ('PENDING', 'ACCEPTED', 'ACCEPTED_WITH_ERRORS', 'REJECTED');

ALTER TABLE "invoices" ADD COLUMN "rectification_code" TEXT;

CREATE TABLE "billing_systems" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "billing_system_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "BillingRecordKind" NOT NULL,
    "invoice_id" UUID NOT NULL,
    "issuer_nif" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "invoice_type" TEXT,
    "cuota_total" TEXT,
    "importe_total" TEXT,
    "previous_hash" CHAR(64),
    "hash" CHAR(64) NOT NULL,
    "generated_at" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "status" "BillingRecordStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_systems_tenant_id_taxpayer_id_key" ON "billing_systems"("tenant_id", "taxpayer_id");
CREATE UNIQUE INDEX "billing_systems_taxpayer_id_key" ON "billing_systems"("taxpayer_id");
CREATE UNIQUE INDEX "billing_systems_taxpayer_id_id_key" ON "billing_systems"("taxpayer_id", "id");
CREATE INDEX "billing_records_taxpayer_id_created_at_idx" ON "billing_records"("taxpayer_id", "created_at");
CREATE UNIQUE INDEX "billing_records_billing_system_id_sequence_key" ON "billing_records"("billing_system_id", "sequence");
CREATE UNIQUE INDEX "billing_records_invoice_id_kind_key" ON "billing_records"("invoice_id", "kind");

ALTER TABLE "billing_systems" ADD CONSTRAINT "billing_systems_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_taxpayer_id_billing_system_id_fkey" FOREIGN KEY ("taxpayer_id", "billing_system_id") REFERENCES "billing_systems"("taxpayer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_taxpayer_id_invoice_id_fkey" FOREIGN KEY ("taxpayer_id", "invoice_id") REFERENCES "invoices"("taxpayer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 2: restricciones que Prisma no expresa
-- ─────────────────────────────────────────────────────────────────────────────

-- Causa de exención (lista L10: E1, E4, E6). 'EXEMPT' sin causa queda solo para los datos anteriores a la Fase 5.
ALTER TABLE "products" DROP CONSTRAINT "products_tax_key";
ALTER TABLE "products" ADD CONSTRAINT "products_tax_key"
  CHECK ("tax_key" IN ('VAT:2100', 'VAT:1000', 'VAT:400', 'VAT:0', 'EXEMPT:E1', 'EXEMPT:E4', 'EXEMPT:E6', 'EXEMPT'));
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_tax_key";
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_key"
  CHECK ("tax_key" IN ('VAT:2100', 'VAT:1000', 'VAT:400', 'VAT:0', 'EXEMPT:E1', 'EXEMPT:E4', 'EXEMPT:E6', 'EXEMPT'));

-- Clave de la rectificativa (lista L2). NOT VALID: las rectificativas anteriores a la Fase 5 no la tienen y,
-- si están emitidas, no se pueden modificar; las nuevas y las que se editen sí deben cumplirla.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rectification_code_value"
  CHECK ("rectification_code" IS NULL OR "rectification_code" IN ('R1', 'R2', 'R3', 'R4'));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rectification_code_consistent"
  CHECK (("kind" = 'RECTIFYING') = ("rectification_code" IS NOT NULL)) NOT VALID;

ALTER TABLE "billing_systems" ADD CONSTRAINT "billing_systems_last_sequence_non_negative" CHECK ("last_sequence" >= 0);

ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_sequence_positive" CHECK ("sequence" >= 1);
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_hash_format" CHECK ("hash" ~ '^[0-9A-F]{64}$');
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_previous_hash_format" CHECK ("previous_hash" IS NULL OR "previous_hash" ~ '^[0-9A-F]{64}$');
-- Primer registro ⇔ sin huella anterior (art. 7.b).
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_first_has_no_previous" CHECK (("sequence" = 1) = ("previous_hash" IS NULL));
-- Un alta lleva tipo de factura, CuotaTotal e ImporteTotal; una anulación, no.
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_kind_fields"
  CHECK (
    ("kind" = 'ALTA' AND "invoice_type" IN ('F1', 'R1', 'R2', 'R3', 'R4') AND "cuota_total" IS NOT NULL AND "importe_total" IS NOT NULL)
    OR ("kind" = 'ANULACION' AND "invoice_type" IS NULL AND "cuota_total" IS NULL AND "importe_total" IS NULL)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 3: la cadena la comprueba la BD al insertar (art. 7.a): cada registro enlaza la huella del
-- inmediatamente anterior de SU facturación, y solo se registran facturas emitidas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION app.check_billing_record_chain() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_previous text;
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = NEW.invoice_id AND i.taxpayer_id = NEW.taxpayer_id AND i.status = 'ISSUED') THEN
      RAISE EXCEPTION 'BILLING_RECORD_INVALID: solo se registran facturas emitidas'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.sequence > 1 THEN
      SELECT r.hash INTO v_previous FROM public.billing_records r
        WHERE r.billing_system_id = NEW.billing_system_id AND r.sequence = NEW.sequence - 1;
      IF v_previous IS NULL OR v_previous IS DISTINCT FROM NEW.previous_hash THEN
        RAISE EXCEPTION 'BILLING_CHAIN_BROKEN: el registro no enlaza con el anterior de la cadena'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "billing_records_chain"
  BEFORE INSERT ON "billing_records"
  FOR EACH ROW EXECUTE FUNCTION app.check_billing_record_chain();

-- Inalterables para TODOS los roles (OM art. 6; R-11): no se borran y solo cambia el estado de la remisión.
CREATE FUNCTION app.reject_billing_record_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'BILLING_RECORD_IMMUTABLE: los registros de facturación no se borran'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'BILLING_RECORD_IMMUTABLE: un registro de facturación no se modifica'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "billing_records_immutable"
  BEFORE UPDATE OR DELETE ON "billing_records"
  FOR EACH ROW EXECUTE FUNCTION app.reject_billing_record_change();

REVOKE ALL ON FUNCTION app.check_billing_record_chain() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_billing_record_change() FROM PUBLIC;

-- IndicadorMultiplesOT (ADR-008, decisión 9): ¿la organización autorizada lleva más de un contribuyente?
-- SECURITY DEFINER: un miembro con acceso a un solo contribuyente no ve los demás, pero el indicador es de la
-- organización. Solo devuelve un booleano de SU organización.
CREATE FUNCTION app.tenant_has_multiple_taxpayers() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT count(*) > 1 FROM public.taxpayers t WHERE t.tenant_id = app.authorized_tenant_id()
  $$;

REVOKE ALL ON FUNCTION app.tenant_has_multiple_taxpayers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tenant_has_multiple_taxpayers() TO facturalibre_app;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 4: permisos y RLS por contribuyente (mismo criterio que la facturación).
-- La aplicación crea facturaciones y registros; nunca los borra. El estado de la remisión lo cambia el
-- worker (Fase 6).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON "billing_systems", "billing_records" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "billing_systems" TO facturalibre_app;
GRANT SELECT, INSERT ON "billing_records" TO facturalibre_app;

ALTER TABLE "billing_systems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_records" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_systems', 'billing_records'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO facturalibre_app
         USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_access_taxpayer(taxpayer_id))',
      t || '_app_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO facturalibre_app
         WITH CHECK (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))',
      t || '_app_insert', t);
  END LOOP;
END
$$;

CREATE POLICY "billing_systems_app_update" ON "billing_systems" FOR UPDATE TO facturalibre_app
  USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))
  WITH CHECK (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id));
