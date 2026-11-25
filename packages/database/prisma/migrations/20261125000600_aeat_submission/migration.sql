-- Fase 6: remisión de los registros VERI*FACTU a la AEAT (OM HAC/1177/2024, arts. 4, 5 y 16; ADR-005).
-- Parte 1 generada con `prisma migrate diff`; el resto (inmutabilidad, permisos y RLS) a mano.

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 1: columnas y tabla
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "billing_records" ADD COLUMN "aeat_csv" TEXT,
ADD COLUMN "aeat_error_code" TEXT,
ADD COLUMN "aeat_error_description" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "submitted_at" TIMESTAMPTZ(6);

ALTER TABLE "billing_systems" ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failing_since" TIMESTAMPTZ(6),
ADD COLUMN "last_error" TEXT,
ADD COLUMN "next_send_at" TIMESTAMPTZ(6),
ADD COLUMN "wait_seconds" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "taxpayer_certificates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "sealed" TEXT NOT NULL,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "taxpayer_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "taxpayer_certificates_tenant_id_taxpayer_id_key" ON "taxpayer_certificates"("tenant_id", "taxpayer_id");
CREATE UNIQUE INDEX "taxpayer_certificates_taxpayer_id_key" ON "taxpayer_certificates"("taxpayer_id");
ALTER TABLE "taxpayer_certificates" ADD CONSTRAINT "taxpayer_certificates_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 2: restricciones e índices
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "billing_systems" ADD CONSTRAINT "billing_systems_wait_seconds_non_negative" CHECK ("wait_seconds" >= 0);
ALTER TABLE "billing_systems" ADD CONSTRAINT "billing_systems_failures_non_negative" CHECK ("consecutive_failures" >= 0);
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_attempts_non_negative" CHECK ("attempts" >= 0);
-- Un registro con respuesta de la AEAT siempre tiene la fecha en que se envió.
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_submitted_when_answered"
  CHECK ("status" = 'PENDING' OR "submitted_at" IS NOT NULL);

-- Lo que el worker busca: registros pendientes de cada facturación, en orden.
CREATE INDEX "billing_records_pending_idx" ON "billing_records" ("billing_system_id", "sequence") WHERE "status" = 'PENDING';

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 3: inmutabilidad. Del registro solo cambia el resultado de su remisión.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.reject_billing_record_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_mutable text[] := ARRAY['status', 'attempts', 'submitted_at', 'aeat_csv', 'aeat_error_code', 'aeat_error_description'];
  BEGIN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'BILLING_RECORD_IMMUTABLE: los registros de facturación no se borran'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
      RAISE EXCEPTION 'BILLING_RECORD_IMMUTABLE: un registro de facturación no se modifica'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END
  $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parte 4: permisos y RLS.
-- Certificados: solo con acceso de escritura al contribuyente (el permiso certificates.manage lo comprueba la
-- aplicación). Worker: proceso de plataforma que remite los registros de todas las organizaciones, como ya hace
-- con el outbox; lee solo lo necesario para remitir y solo actualiza las columnas de la remisión.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON "taxpayer_certificates" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "taxpayer_certificates" TO facturalibre_app;
ALTER TABLE "taxpayer_certificates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxpayer_certificates_app_all" ON "taxpayer_certificates" FOR ALL TO facturalibre_app
  USING (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id))
  WITH CHECK (tenant_id = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer(taxpayer_id));

GRANT SELECT ON "billing_systems", "billing_records", "taxpayer_certificates", "taxpayers" TO facturalibre_worker;
GRANT UPDATE ("next_send_at", "wait_seconds", "consecutive_failures", "failing_since", "last_error") ON "billing_systems" TO facturalibre_worker;
GRANT UPDATE ("status", "attempts", "submitted_at", "aeat_csv", "aeat_error_code", "aeat_error_description") ON "billing_records" TO facturalibre_worker;

CREATE POLICY "billing_systems_worker_select" ON "billing_systems" FOR SELECT TO facturalibre_worker USING (true);
CREATE POLICY "billing_systems_worker_update" ON "billing_systems" FOR UPDATE TO facturalibre_worker USING (true) WITH CHECK (true);
CREATE POLICY "billing_records_worker_select" ON "billing_records" FOR SELECT TO facturalibre_worker USING (true);
CREATE POLICY "billing_records_worker_update" ON "billing_records" FOR UPDATE TO facturalibre_worker USING (true) WITH CHECK (true);
CREATE POLICY "taxpayer_certificates_worker_select" ON "taxpayer_certificates" FOR SELECT TO facturalibre_worker USING (true);
CREATE POLICY "taxpayers_worker_select" ON "taxpayers" FOR SELECT TO facturalibre_worker USING (true);
