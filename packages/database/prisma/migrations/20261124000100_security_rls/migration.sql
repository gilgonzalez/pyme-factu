-- FacturaLibre — Migración de seguridad: restricciones de integridad, contexto de seguridad,
-- permisos por rol de base de datos y Row Level Security (RLS).
-- Documentación: docs/tenancy/rls-policies.md
--
-- Requisitos previos: los roles de login existen (los crea src/bootstrap.ts antes de migrar):
--   facturalibre_app     — aplicación web (sin BYPASSRLS, no propietario de tablas)
--   facturalibre_auth    — librería de autenticación (solo tablas de identidad)
--   facturalibre_worker  — worker asíncrono (outbox; datos de dominio siempre con contexto de tenant)
-- El propietario de las tablas es el rol que ejecuta las migraciones. Nunca se usa en tiempo de ejecución.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Restricciones de integridad que Prisma no expresa
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$');
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_deactivation_consistent"
  CHECK (("status" = 'DEACTIVATED') = ("deactivated_at" IS NOT NULL));

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_currency_eur" CHECK ("currency" = 'EUR');

-- Un único OWNER por tenant; el OWNER siempre ve todos los contribuyentes.
CREATE UNIQUE INDEX "tenant_memberships_one_owner" ON "tenant_memberships" ("tenant_id") WHERE "role" = 'OWNER';
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_owner_all_taxpayers"
  CHECK ("role" <> 'OWNER' OR "taxpayer_scope" = 'ALL_TAXPAYERS');

ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_never_owner" CHECK ("role" <> 'OWNER');
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_single_outcome"
  CHECK (NOT ("accepted_at" IS NOT NULL AND "revoked_at" IS NOT NULL));
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_accepted_consistent"
  CHECK (("accepted_at" IS NULL) = ("accepted_by_user_id" IS NULL));
-- Como máximo una invitación pendiente por email y tenant.
CREATE UNIQUE INDEX "tenant_invitations_one_pending" ON "tenant_invitations" ("tenant_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- NIF: 9 caracteres alfanuméricos en mayúsculas. El dígito de control se valida en el dominio.
ALTER TABLE "taxpayers" ADD CONSTRAINT "taxpayers_nif_format" CHECK ("nif" ~ '^[0-9A-Z]{9}$');
ALTER TABLE "taxpayers" ADD CONSTRAINT "taxpayers_country_code_format" CHECK ("country_code" ~ '^[A-Z]{2}$');

ALTER TABLE "taxpayer_settings" ADD CONSTRAINT "taxpayer_settings_payment_terms_range"
  CHECK ("default_payment_terms_days" IS NULL OR "default_payment_terms_days" BETWEEN 0 AND 3650);

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_range"
  CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contexto de seguridad (variables locales a la transacción: set_config(..., true))
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA "app";
REVOKE ALL ON SCHEMA "app" FROM PUBLIC;

-- NULLIF: tras terminar una transacción con SET LOCAL, la variable vuelve a '' (no a NULL).
CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app.current_taxpayer_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.taxpayer_id', true), '')::uuid $$;

-- Devuelve el tenant del contexto SOLO si el usuario del contexto tiene membresía ACTIVA en él.
-- Así, aunque la aplicación estableciera un tenant equivocado, la base de datos no devolvería datos.
-- SECURITY DEFINER: lee tenant_memberships sin depender de sus propias políticas (evita recursión).
CREATE FUNCTION app.authorized_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT m.tenant_id
    FROM public.tenant_memberships m
    WHERE m.tenant_id = app.current_tenant_id()
      AND m.user_id = app.current_user_id()
      AND m.status = 'ACTIVE'
  $$;

-- ¿Puede el usuario del contexto ver este contribuyente dentro del tenant del contexto?
CREATE FUNCTION app.can_access_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.taxpayers tp ON tp.tenant_id = m.tenant_id AND tp.id = p_taxpayer_id
      WHERE m.tenant_id = app.current_tenant_id()
        AND m.user_id = app.current_user_id()
        AND m.status = 'ACTIVE'
        AND (
          m.taxpayer_scope = 'ALL_TAXPAYERS'
          OR EXISTS (
            SELECT 1 FROM public.taxpayer_memberships tm
            WHERE tm.tenant_id = m.tenant_id AND tm.taxpayer_id = p_taxpayer_id AND tm.user_id = m.user_id
          )
        )
    )
  $$;

-- ¿Puede modificar datos de este contribuyente? (alcance total, o asignación con nivel FULL)
CREATE FUNCTION app.can_write_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.taxpayers tp ON tp.tenant_id = m.tenant_id AND tp.id = p_taxpayer_id
      WHERE m.tenant_id = app.current_tenant_id()
        AND m.user_id = app.current_user_id()
        AND m.status = 'ACTIVE'
        AND (
          m.taxpayer_scope = 'ALL_TAXPAYERS'
          OR EXISTS (
            SELECT 1 FROM public.taxpayer_memberships tm
            WHERE tm.tenant_id = m.tenant_id AND tm.taxpayer_id = p_taxpayer_id
              AND tm.user_id = m.user_id AND tm.access_level = 'FULL'
          )
        )
    )
  $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "app" FROM PUBLIC;
GRANT USAGE ON SCHEMA "app" TO facturalibre_app, facturalibre_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "app" TO facturalibre_app, facturalibre_worker;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Auditoría append-only
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION app.reject_audit_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION 'audit_events es append-only: % no permitido', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END
  $$;

CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos (mínimo privilegio). Nada se concede a PUBLIC.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO facturalibre_app, facturalibre_auth, facturalibre_worker;

-- Rol de autenticación: solo identidad.
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "sessions", "accounts", "verifications" TO facturalibre_auth;
GRANT SELECT, INSERT, UPDATE ON "user_profiles" TO facturalibre_auth;

-- Rol de aplicación.
GRANT SELECT ON "users" TO facturalibre_app;
GRANT UPDATE ("name", "image") ON "users" TO facturalibre_app;
GRANT SELECT, INSERT, UPDATE ON "user_profiles" TO facturalibre_app;
-- Alta de tenants: se hará mediante una función SECURITY DEFINER dedicada (Fase 2), no con INSERT directo.
GRANT SELECT, UPDATE ON "tenants" TO facturalibre_app;
GRANT SELECT, UPDATE ON "tenant_settings" TO facturalibre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_memberships" TO facturalibre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_invitations" TO facturalibre_app;
-- Contribuyentes: sin DELETE (se desactivan; sus registros fiscales deben conservarse).
GRANT SELECT, INSERT, UPDATE ON "taxpayers" TO facturalibre_app;
GRANT SELECT, INSERT, UPDATE ON "taxpayer_settings" TO facturalibre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "taxpayer_memberships" TO facturalibre_app;
GRANT SELECT, INSERT ON "audit_events" TO facturalibre_app;
GRANT SELECT, INSERT ON "outbox_events" TO facturalibre_app;

-- Worker.
GRANT SELECT, UPDATE ON "outbox_events" TO facturalibre_worker;
GRANT SELECT, INSERT ON "audit_events" TO facturalibre_worker;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security. TODAS las tablas de public tienen RLS habilitado.
--    Sin política aplicable => cero filas (denegación por defecto).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verifications"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "taxpayers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "taxpayer_settings"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "taxpayer_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events"        ENABLE ROW LEVEL SECURITY;

-- Identidad (rol auth): acceso completo a sus tablas; el rol auth no tiene permisos sobre datos de tenants.
CREATE POLICY "users_auth_all"         ON "users"         FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);
CREATE POLICY "user_profiles_auth_all" ON "user_profiles" FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);
CREATE POLICY "sessions_auth_all"      ON "sessions"      FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);
CREATE POLICY "accounts_auth_all"      ON "accounts"      FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);
CREATE POLICY "verifications_auth_all" ON "verifications" FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);

-- users (app): uno mismo, o miembros del tenant autorizado (p. ej. pantalla de equipo).
CREATE POLICY "users_app_select" ON "users" FOR SELECT TO facturalibre_app
  USING (
    "id" = app.current_user_id()
    OR "id" IN (SELECT tm."user_id" FROM "tenant_memberships" tm WHERE tm."tenant_id" = (SELECT app.authorized_tenant_id()))
  );
CREATE POLICY "users_app_update_self" ON "users" FOR UPDATE TO facturalibre_app
  USING ("id" = app.current_user_id()) WITH CHECK ("id" = app.current_user_id());

CREATE POLICY "user_profiles_app_self" ON "user_profiles" FOR ALL TO facturalibre_app
  USING ("user_id" = app.current_user_id()) WITH CHECK ("user_id" = app.current_user_id());

-- tenants: el autorizado, o aquellos en los que el usuario tiene membresía activa (selector de organización).
CREATE POLICY "tenants_app_select" ON "tenants" FOR SELECT TO facturalibre_app
  USING (
    "id" = (SELECT app.authorized_tenant_id())
    OR "id" IN (SELECT m."tenant_id" FROM "tenant_memberships" m WHERE m."user_id" = app.current_user_id() AND m."status" = 'ACTIVE')
  );
CREATE POLICY "tenants_app_update" ON "tenants" FOR UPDATE TO facturalibre_app
  USING ("id" = (SELECT app.authorized_tenant_id())) WITH CHECK ("id" = (SELECT app.authorized_tenant_id()));

CREATE POLICY "tenant_settings_app" ON "tenant_settings" FOR ALL TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id())) WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));

-- tenant_memberships: las propias (para listar organizaciones) y las del tenant autorizado.
CREATE POLICY "tenant_memberships_app_select" ON "tenant_memberships" FOR SELECT TO facturalibre_app
  USING ("user_id" = app.current_user_id() OR "tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "tenant_memberships_app_insert" ON "tenant_memberships" FOR INSERT TO facturalibre_app
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "tenant_memberships_app_update" ON "tenant_memberships" FOR UPDATE TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id())) WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "tenant_memberships_app_delete" ON "tenant_memberships" FOR DELETE TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()));

CREATE POLICY "tenant_invitations_app" ON "tenant_invitations" FOR ALL TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id())) WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));

-- taxpayers: dentro del tenant autorizado y solo los contribuyentes a los que el usuario tiene acceso.
CREATE POLICY "taxpayers_app_select" ON "taxpayers" FOR SELECT TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_access_taxpayer("id"));
CREATE POLICY "taxpayers_app_insert" ON "taxpayers" FOR INSERT TO facturalibre_app
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "taxpayers_app_update" ON "taxpayers" FOR UPDATE TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer("id"))
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer("id"));

CREATE POLICY "taxpayer_settings_app_select" ON "taxpayer_settings" FOR SELECT TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_access_taxpayer("taxpayer_id"));
CREATE POLICY "taxpayer_settings_app_insert" ON "taxpayer_settings" FOR INSERT TO facturalibre_app
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer("taxpayer_id"));
CREATE POLICY "taxpayer_settings_app_update" ON "taxpayer_settings" FOR UPDATE TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer("taxpayer_id"))
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()) AND app.can_write_taxpayer("taxpayer_id"));

CREATE POLICY "taxpayer_memberships_app" ON "taxpayer_memberships" FOR ALL TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id())) WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));

-- audit_events: lectura dentro del tenant autorizado; inserción solo como uno mismo.
-- Los intentos denegados contra otro tenant se registran con tenant_id NULL.
CREATE POLICY "audit_events_app_select" ON "audit_events" FOR SELECT TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "audit_events_app_insert" ON "audit_events" FOR INSERT TO facturalibre_app
  WITH CHECK (
    "actor_user_id" = app.current_user_id()
    AND ("tenant_id" IS NULL OR "tenant_id" = (SELECT app.authorized_tenant_id()))
  );
CREATE POLICY "audit_events_worker_select" ON "audit_events" FOR SELECT TO facturalibre_worker
  USING ("tenant_id" = app.current_tenant_id());
CREATE POLICY "audit_events_worker_insert" ON "audit_events" FOR INSERT TO facturalibre_worker
  WITH CHECK ("actor_user_id" IS NULL AND "tenant_id" = app.current_tenant_id());

-- outbox_events: la aplicación encola en su tenant; el worker reclama de todos los tenants
-- y procesa cada evento estableciendo el contexto del tenant del propio evento.
CREATE POLICY "outbox_events_app_select" ON "outbox_events" FOR SELECT TO facturalibre_app
  USING ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "outbox_events_app_insert" ON "outbox_events" FOR INSERT TO facturalibre_app
  WITH CHECK ("tenant_id" = (SELECT app.authorized_tenant_id()));
CREATE POLICY "outbox_events_worker_select" ON "outbox_events" FOR SELECT TO facturalibre_worker USING (true);
CREATE POLICY "outbox_events_worker_update" ON "outbox_events" FOR UPDATE TO facturalibre_worker USING (true) WITH CHECK (true);
