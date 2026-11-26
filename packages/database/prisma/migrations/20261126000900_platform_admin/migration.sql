-- Administración de la plataforma (superadmin): panel con metadatos, suspensión de cuentas y organizaciones,
-- estado VERI*FACTU global y acceso de SOPORTE de solo lectura a una organización. Todo pasa por funciones
-- SECURITY DEFINER que exigen ser administrador; quién lo es solo lo decide el rol propietario (sin GRANT a nadie).

CREATE TABLE "platform_admins" (
  "user_id" UUID NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
REVOKE ALL ON "platform_admins" FROM PUBLIC;
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;

-- Suspensión por la plataforma (distinta de la desactivación que hace el propio usuario).
ALTER TABLE "users" ADD COLUMN "suspended_at" TIMESTAMPTZ(6), ADD COLUMN "suspended_reason" TEXT;
ALTER TABLE "tenants" ADD COLUMN "suspended_at" TIMESTAMPTZ(6), ADD COLUMN "suspended_reason" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_reason_length" CHECK (char_length("suspended_reason") <= 500);
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_suspended_reason_length" CHECK (char_length("suspended_reason") <= 500);

-- ¿Es administrador de la plataforma el usuario del contexto? (y no está desactivado ni suspendido)
CREATE FUNCTION app.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.platform_admins a JOIN public.users u ON u.id = a.user_id
      WHERE a.user_id = app.current_user_id() AND u.deactivated_at IS NULL AND u.suspended_at IS NULL
    )
  $$;

CREATE FUNCTION app.require_platform_admin() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT app.is_platform_admin() THEN
      RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED: solo para administradores de la plataforma' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END
  $$;

-- Organización abierta en modo SOPORTE: solo para un administrador, con app.support = 'on' y SOLO dentro de una
-- transacción de lectura. Es la base de datos la que garantiza que el soporte no puede escribir.
CREATE FUNCTION app.support_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE
      WHEN NULLIF(current_setting('app.support', true), '') = 'on'
        AND current_setting('transaction_read_only') = 'on'
        AND app.is_platform_admin()
      THEN app.current_tenant_id()
    END
  $$;

-- Membresía activa en una organización NO suspendida, o el soporte de solo lectura.
CREATE OR REPLACE FUNCTION app.authorized_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT COALESCE(
      (SELECT m.tenant_id
       FROM public.tenant_memberships m JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.tenant_id = app.current_tenant_id()
         AND m.user_id = app.current_user_id()
         AND m.status = 'ACTIVE'
         AND t.suspended_at IS NULL),
      app.support_tenant_id()
    )
  $$;

CREATE OR REPLACE FUNCTION app.can_access_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id = m.tenant_id AND t.suspended_at IS NULL
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
    OR EXISTS (SELECT 1 FROM public.taxpayers tp WHERE tp.id = p_taxpayer_id AND tp.tenant_id = app.support_tenant_id())
  $$;

CREATE OR REPLACE FUNCTION app.can_write_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id = m.tenant_id AND t.suspended_at IS NULL
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

-- ─── Panel (solo metadatos; nunca el contenido de facturas ni de clientes) ─────

CREATE FUNCTION app.admin_overview() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    RETURN jsonb_build_object(
      'users', (SELECT count(*) FROM public.users),
      'verifiedUsers', (SELECT count(*) FROM public.users WHERE email_verified),
      'suspendedUsers', (SELECT count(*) FROM public.users WHERE suspended_at IS NOT NULL),
      'tenants', (SELECT count(*) FROM public.tenants),
      'suspendedTenants', (SELECT count(*) FROM public.tenants WHERE suspended_at IS NOT NULL),
      'taxpayers', (SELECT count(*) FROM public.taxpayers),
      'issuedInvoices', (SELECT count(*) FROM public.invoices WHERE status = 'ISSUED'),
      'draftInvoices', (SELECT count(*) FROM public.invoices WHERE status = 'DRAFT'),
      'pendingRecords', (SELECT count(*) FROM public.billing_records WHERE status = 'PENDING'),
      'rejectedRecords', (SELECT count(*) FROM public.billing_records WHERE status = 'REJECTED')
    );
  END
  $$;

CREATE FUNCTION app.admin_tenants()
  RETURNS TABLE (id uuid, name text, slug text, created_at timestamptz, suspended_at timestamptz, suspended_reason text,
                 members bigint, taxpayers bigint, issued_invoices bigint, draft_invoices bigint, last_issued_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    RETURN QUERY
      SELECT t.id, t.name, t.slug, t.created_at, t.suspended_at, t.suspended_reason,
        (SELECT count(*) FROM public.tenant_memberships m WHERE m.tenant_id = t.id AND m.status = 'ACTIVE'),
        (SELECT count(*) FROM public.taxpayers tp WHERE tp.tenant_id = t.id),
        (SELECT count(*) FROM public.invoices i WHERE i.tenant_id = t.id AND i.status = 'ISSUED'),
        (SELECT count(*) FROM public.invoices i WHERE i.tenant_id = t.id AND i.status = 'DRAFT'),
        (SELECT max(i.issued_at) FROM public.invoices i WHERE i.tenant_id = t.id)
      FROM public.tenants t
      ORDER BY t.created_at DESC;
  END
  $$;

CREATE FUNCTION app.admin_users()
  RETURNS TABLE (id uuid, name text, email text, email_verified boolean, created_at timestamptz, deactivated_at timestamptz,
                 suspended_at timestamptz, suspended_reason text, organizations bigint, is_admin boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    RETURN QUERY
      SELECT u.id, u.name, u.email, u.email_verified, u.created_at, u.deactivated_at, u.suspended_at, u.suspended_reason,
        (SELECT count(*) FROM public.tenant_memberships m WHERE m.user_id = u.id AND m.status = 'ACTIVE'),
        EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = u.id)
      FROM public.users u
      ORDER BY u.created_at DESC;
  END
  $$;

-- Estado de la remisión VERI*FACTU por contribuyente: recuentos y último error (sin datos de las facturas).
CREATE FUNCTION app.admin_verifactu()
  RETURNS TABLE (tenant_id uuid, tenant_name text, taxpayer_id uuid, taxpayer_name text, taxpayer_nif text,
                 pending bigint, accepted bigint, accepted_with_errors bigint, rejected bigint, oldest_pending_at timestamptz,
                 last_error_code text, last_error_description text, last_error_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    RETURN QUERY
      SELECT t.id, t.name, tp.id, tp.legal_name, tp.nif,
        count(*) FILTER (WHERE r.status = 'PENDING'),
        count(*) FILTER (WHERE r.status = 'ACCEPTED'),
        count(*) FILTER (WHERE r.status = 'ACCEPTED_WITH_ERRORS'),
        count(*) FILTER (WHERE r.status = 'REJECTED'),
        min(r.created_at) FILTER (WHERE r.status = 'PENDING'),
        (array_agg(r.aeat_error_code ORDER BY r.created_at DESC) FILTER (WHERE r.aeat_error_code IS NOT NULL))[1],
        (array_agg(r.aeat_error_description ORDER BY r.created_at DESC) FILTER (WHERE r.aeat_error_code IS NOT NULL))[1],
        max(r.created_at) FILTER (WHERE r.aeat_error_code IS NOT NULL)
      FROM public.billing_records r
      JOIN public.taxpayers tp ON tp.id = r.taxpayer_id
      JOIN public.tenants t ON t.id = r.tenant_id
      GROUP BY t.id, t.name, tp.id, tp.legal_name, tp.nif
      ORDER BY count(*) FILTER (WHERE r.status = 'REJECTED') DESC, count(*) FILTER (WHERE r.status = 'PENDING') DESC, t.name;
  END
  $$;

CREATE FUNCTION app.admin_find_tenant(p_slug text) RETURNS TABLE (id uuid, slug text, name text, suspended_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    RETURN QUERY SELECT t.id, t.slug, t.name, t.suspended_at FROM public.tenants t WHERE t.slug = p_slug;
  END
  $$;

-- ─── Acciones (auditadas) ──────────────────────────────────────────────────────

CREATE FUNCTION app.admin_set_tenant_suspended(p_tenant_id uuid, p_suspended boolean, p_reason text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
      RETURN 'NOT_FOUND';
    END IF;
    UPDATE public.tenants
      SET suspended_at = CASE WHEN p_suspended THEN COALESCE(suspended_at, now()) END,
          suspended_reason = CASE WHEN p_suspended THEN p_reason END,
          updated_at = now()
      WHERE id = p_tenant_id;
    INSERT INTO public.audit_events (actor_user_id, tenant_id, action, entity_type, entity_id, outcome, metadata)
      VALUES (app.current_user_id(), p_tenant_id,
              CASE WHEN p_suspended THEN 'platform.tenant_suspended' ELSE 'platform.tenant_reactivated' END,
              'tenant', p_tenant_id::text, 'SUCCESS',
              CASE WHEN p_suspended THEN jsonb_build_object('reason', p_reason) END);
    RETURN 'OK';
  END
  $$;

CREATE FUNCTION app.admin_set_user_suspended(p_user_id uuid, p_suspended boolean, p_reason text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    IF p_user_id = app.current_user_id() THEN
      RETURN 'SELF';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
      RETURN 'NOT_FOUND';
    END IF;
    UPDATE public.users
      SET suspended_at = CASE WHEN p_suspended THEN COALESCE(suspended_at, now()) END,
          suspended_reason = CASE WHEN p_suspended THEN p_reason END,
          updated_at = now()
      WHERE id = p_user_id;
    -- Suspender cierra todas sus sesiones (la capa de autenticación no abre otras nuevas).
    IF p_suspended THEN
      DELETE FROM public.sessions WHERE user_id = p_user_id;
    END IF;
    INSERT INTO public.audit_events (actor_user_id, action, entity_type, entity_id, outcome, metadata)
      VALUES (app.current_user_id(),
              CASE WHEN p_suspended THEN 'platform.user_suspended' ELSE 'platform.user_reactivated' END,
              'user', p_user_id::text, 'SUCCESS',
              CASE WHEN p_suspended THEN jsonb_build_object('reason', p_reason) END);
    RETURN 'OK';
  END
  $$;

-- Cada entrada en modo soporte queda registrada en la auditoría de ESA organización.
CREATE FUNCTION app.admin_log_support_access(p_tenant_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    PERFORM app.require_platform_admin();
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
      RETURN 'NOT_FOUND';
    END IF;
    INSERT INTO public.audit_events (actor_user_id, tenant_id, action, entity_type, entity_id, outcome)
      VALUES (app.current_user_id(), p_tenant_id, 'platform.support_access', 'tenant', p_tenant_id::text, 'SUCCESS');
    RETURN 'OK';
  END
  $$;

REVOKE ALL ON FUNCTION app.is_platform_admin(), app.require_platform_admin(), app.support_tenant_id(), app.admin_overview(),
  app.admin_tenants(), app.admin_users(), app.admin_verifactu(), app.admin_find_tenant(text),
  app.admin_set_tenant_suspended(uuid, boolean, text), app.admin_set_user_suspended(uuid, boolean, text),
  app.admin_log_support_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_platform_admin(), app.require_platform_admin(), app.support_tenant_id(), app.admin_overview(),
  app.admin_tenants(), app.admin_users(), app.admin_verifactu(), app.admin_find_tenant(text),
  app.admin_set_tenant_suspended(uuid, boolean, text), app.admin_set_user_suspended(uuid, boolean, text),
  app.admin_log_support_access(uuid) TO facturalibre_app;
-- El worker evalúa políticas que llaman a estas funciones.
GRANT EXECUTE ON FUNCTION app.is_platform_admin(), app.support_tenant_id() TO facturalibre_worker;
