-- Configuración de empresa: datos de contacto y registrales del emisor, datos de cobro (IBAN, instrucciones,
-- plazo), logotipo y valores por defecto de las facturas. Se imprimen en borradores y facturas; al emitir se
-- congelan en issuer_snapshot (una factura emitida no cambia si después cambia la configuración).
-- Los permisos y el RLS de "taxpayers" y "taxpayer_settings" ya cubren las columnas nuevas.

ALTER TABLE "taxpayers"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "website" TEXT,
  -- Datos de inscripción en el Registro Mercantil (obligatorios en las facturas de las sociedades, RRM art. 24).
  ADD COLUMN "registry_info" TEXT;

ALTER TABLE "taxpayers" ADD CONSTRAINT "taxpayers_contact_lengths"
  CHECK (char_length("phone") <= 30 AND char_length("website") <= 200 AND char_length("registry_info") <= 300);

ALTER TABLE "taxpayer_settings"
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "payment_instructions" TEXT,
  -- Retención de IRPF por defecto en porcentaje a escala 2 (1500 = 15 %), como en "invoices".
  ADD COLUMN "default_withholding_percent" INTEGER,
  ADD COLUMN "default_tax_key" TEXT,
  ADD COLUMN "email_message" TEXT,
  ADD COLUMN "logo" BYTEA,
  ADD COLUMN "logo_mime_type" TEXT;

ALTER TABLE "taxpayer_settings"
  ADD CONSTRAINT "taxpayer_settings_iban_format" CHECK ("iban" ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  ADD CONSTRAINT "taxpayer_settings_withholding_range" CHECK ("default_withholding_percent" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "taxpayer_settings_tax_key_format" CHECK ("default_tax_key" ~ '^(VAT:[0-9]{1,5}|EXEMPT(:E[0-9])?)$'),
  ADD CONSTRAINT "taxpayer_settings_text_lengths"
    CHECK (char_length("payment_instructions") <= 500 AND char_length("invoice_footer_note") <= 1000 AND char_length("email_message") <= 2000),
  -- Logo: PNG o JPEG de hasta 512 KB, y siempre con su tipo.
  ADD CONSTRAINT "taxpayer_settings_logo"
    CHECK (("logo" IS NULL AND "logo_mime_type" IS NULL)
        OR ("logo" IS NOT NULL AND "logo_mime_type" IN ('image/png', 'image/jpeg') AND octet_length("logo") <= 524288));

-- Vencimiento: fecha de expedición + plazo de pago configurado, fijado al emitir.
ALTER TABLE "invoices" ADD COLUMN "due_date" DATE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_date_after_issue"
  CHECK ("due_date" IS NULL OR ("issue_date" IS NOT NULL AND "due_date" >= "issue_date"));
