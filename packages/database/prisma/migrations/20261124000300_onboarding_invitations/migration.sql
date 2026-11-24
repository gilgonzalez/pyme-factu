-- FacturaLibre — Fase 2: alta de organizaciones, invitaciones y rate limiting de autenticación.
-- Documentación: docs/tenancy/rls-policies.md (sección «Funciones de alta e invitación»).
--
-- El rol de aplicación NO puede insertar en tenants ni crear membresías fuera de su tenant autorizado.
-- Las dos operaciones que cruzan esa frontera (crear una organización, unirse a una por invitación)
-- se hacen con funciones SECURITY DEFINER pequeñas que validan todo con el contexto de seguridad.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rate limiting persistente (Better Auth, rol facturalibre_auth)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,
    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "rate_limits" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limits" TO facturalibre_auth;
CREATE POLICY "rate_limits_auth_all" ON "rate_limits" FOR ALL TO facturalibre_auth USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Alta de organización
-- ─────────────────────────────────────────────────────────────────────────────

-- Crea el tenant, su configuración y la membresía OWNER del usuario del contexto, y lo audita.
-- Errores: AUTH_REQUIRED (sin usuario en el contexto), EMAIL_NOT_VERIFIED, 23505 (slug ocupado),
-- 23514 (slug con formato inválido).
CREATE FUNCTION app.create_tenant(p_name text, p_slug text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_tenant_id uuid;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.email_verified) THEN
      RAISE EXCEPTION 'EMAIL_NOT_VERIFIED' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.tenants (slug, name, updated_at) VALUES (p_slug, p_name, now()) RETURNING id INTO v_tenant_id;
    INSERT INTO public.tenant_settings (tenant_id, updated_at) VALUES (v_tenant_id, now());
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, taxpayer_scope, status, updated_at)
      VALUES (v_tenant_id, v_user_id, 'OWNER', 'ALL_TAXPAYERS', 'ACTIVE', now());
    INSERT INTO public.audit_events (actor_user_id, tenant_id, action, entity_type, entity_id, outcome)
      VALUES (v_user_id, v_tenant_id, 'tenant.created', 'tenant', v_tenant_id::text, 'SUCCESS');
    RETURN v_tenant_id;
  END
  $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Invitaciones (quien acepta aún no es miembro: RLS no le deja ver la invitación)
--    Conocer el token es la credencial; la base de datos solo guarda su SHA-256.
-- ─────────────────────────────────────────────────────────────────────────────

-- Estado derivado de una invitación: PENDING | EXPIRED | ACCEPTED | REVOKED.
CREATE FUNCTION app.invitation_status(i public.tenant_invitations) RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE
             WHEN i.accepted_at IS NOT NULL THEN 'ACCEPTED'
             WHEN i.revoked_at IS NOT NULL THEN 'REVOKED'
             WHEN i.expires_at <= now() THEN 'EXPIRED'
             ELSE 'PENDING'
           END
  $$;

-- Datos mínimos para la pantalla «Te han invitado a …». Sin filas si el token no existe.
CREATE FUNCTION app.invitation_preview(p_token_hash text)
  RETURNS TABLE (tenant_name text, email text, role text, status text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT t.name, i.email, i.role::text, app.invitation_status(i)
    FROM public.tenant_invitations i
    JOIN public.tenants t ON t.id = i.tenant_id
    WHERE i.token_hash = p_token_hash AND app.current_user_id() IS NOT NULL
  $$;

-- Acepta la invitación para el usuario del contexto. Idempotente: aceptar dos veces devuelve ACCEPTED.
-- Devuelve un estado en lugar de lanzar errores (la interfaz muestra un mensaje por cada uno):
--   ACCEPTED | NOT_FOUND | EXPIRED | REVOKED | EMAIL_MISMATCH | EMAIL_NOT_VERIFIED
-- Si el usuario ya era miembro, no se crea otra membresía ni se cambia su rol.
CREATE FUNCTION app.accept_invitation(p_token_hash text)
  RETURNS TABLE (status text, tenant_slug text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_user public.users;
    v_invitation public.tenant_invitations;
    v_status text;
  BEGIN
    SELECT * INTO v_user FROM public.users u WHERE u.id = app.current_user_id();
    SELECT * INTO v_invitation FROM public.tenant_invitations i WHERE i.token_hash = p_token_hash FOR UPDATE;
    IF v_user.id IS NULL OR v_invitation.id IS NULL THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text;
      RETURN;
    END IF;

    IF v_invitation.email <> v_user.email THEN
      RETURN QUERY SELECT 'EMAIL_MISMATCH'::text, NULL::text;
      RETURN;
    END IF;
    IF NOT v_user.email_verified THEN
      RETURN QUERY SELECT 'EMAIL_NOT_VERIFIED'::text, NULL::text;
      RETURN;
    END IF;

    v_status := app.invitation_status(v_invitation);
    IF v_status = 'PENDING' THEN
      INSERT INTO public.tenant_memberships (tenant_id, user_id, role, taxpayer_scope, status, updated_at)
        VALUES (v_invitation.tenant_id, v_user.id, v_invitation.role, v_invitation.taxpayer_scope, 'ACTIVE', now())
        ON CONFLICT (tenant_id, user_id) DO NOTHING;
      UPDATE public.tenant_invitations SET accepted_at = now(), accepted_by_user_id = v_user.id WHERE id = v_invitation.id;
      INSERT INTO public.audit_events (actor_user_id, tenant_id, action, entity_type, entity_id, outcome)
        VALUES (v_user.id, v_invitation.tenant_id, 'invitation.accepted', 'tenant_invitation', v_invitation.id::text, 'SUCCESS');
      v_status := 'ACCEPTED';
    ELSIF v_status = 'ACCEPTED' AND v_invitation.accepted_by_user_id <> v_user.id THEN
      v_status := 'NOT_FOUND';
    END IF;

    RETURN QUERY
      SELECT v_status, CASE WHEN v_status = 'ACCEPTED' THEN t.slug END
      FROM public.tenants t WHERE t.id = v_invitation.tenant_id;
  END
  $$;

REVOKE ALL ON FUNCTION app.create_tenant(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.invitation_status(public.tenant_invitations) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.invitation_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_tenant(text, text) TO facturalibre_app;
GRANT EXECUTE ON FUNCTION app.invitation_preview(text) TO facturalibre_app;
GRANT EXECUTE ON FUNCTION app.accept_invitation(text) TO facturalibre_app;
