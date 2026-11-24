-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'EMPLOYEE', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TaxpayerScope" AS ENUM ('ALL_TAXPAYERS', 'ASSIGNED_TAXPAYERS');

-- CreateEnum
CREATE TYPE "TaxpayerAccessLevel" AS ENUM ('READ_ONLY', 'FULL');

-- CreateEnum
CREATE TYPE "TaxpayerPersonType" AS ENUM ('NATURAL_PERSON', 'LEGAL_ENTITY');

-- CreateEnum
CREATE TYPE "TaxpayerStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-ES',
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-ES',
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TenantRole" NOT NULL,
    "taxpayer_scope" "TaxpayerScope" NOT NULL DEFAULT 'ASSIGNED_TAXPAYERS',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "taxpayer_scope" "TaxpayerScope" NOT NULL DEFAULT 'ASSIGNED_TAXPAYERS',
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxpayers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "person_type" "TaxpayerPersonType" NOT NULL,
    "nif" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country_code" CHAR(2) NOT NULL DEFAULT 'ES',
    "email" TEXT,
    "status" "TaxpayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "taxpayers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxpayer_settings" (
    "taxpayer_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "default_payment_terms_days" INTEGER,
    "invoice_footer_note" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "taxpayer_settings_pkey" PRIMARY KEY ("taxpayer_id")
);

-- CreateTable
CREATE TABLE "taxpayer_memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_level" "TaxpayerAccessLevel" NOT NULL DEFAULT 'FULL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxpayer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "tenant_id" UUID,
    "taxpayer_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "request_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "taxpayer_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 10,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitations_token_hash_key" ON "tenant_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "tenant_invitations_tenant_id_idx" ON "tenant_invitations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_tenant_id_id_key" ON "taxpayers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayers_tenant_id_nif_key" ON "taxpayers"("tenant_id", "nif");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayer_settings_tenant_id_taxpayer_id_key" ON "taxpayer_settings"("tenant_id", "taxpayer_id");

-- CreateIndex
CREATE INDEX "taxpayer_memberships_tenant_id_user_id_idx" ON "taxpayer_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayer_memberships_taxpayer_id_user_id_key" ON "taxpayer_memberships"("taxpayer_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_occurred_at_idx" ON "audit_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_idx" ON "outbox_events"("tenant_id");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxpayers" ADD CONSTRAINT "taxpayers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxpayer_settings" ADD CONSTRAINT "taxpayer_settings_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxpayer_memberships" ADD CONSTRAINT "taxpayer_memberships_tenant_id_taxpayer_id_fkey" FOREIGN KEY ("tenant_id", "taxpayer_id") REFERENCES "taxpayers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxpayer_memberships" ADD CONSTRAINT "taxpayer_memberships_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "tenant_memberships"("tenant_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
