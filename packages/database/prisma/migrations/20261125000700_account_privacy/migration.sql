-- Fase 7: derechos sobre los datos personales de la cuenta (RGPD arts. 15 y 20) y desactivación de la cuenta
-- (docs/compliance/data-protection.md: desactivar ≠ suprimir ≠ conservar). Funciones SECURITY DEFINER limitadas al
-- usuario del contexto (app.user_id), como las de invitaciones.

ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMPTZ(6);

-- Copia de los datos personales de la propia cuenta, en un formato legible y reutilizable (JSON).
CREATE FUNCTION app.my_personal_data() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE WHEN app.current_user_id() IS NULL THEN NULL ELSE jsonb_build_object(
      'usuario', (SELECT jsonb_build_object('id', u.id, 'nombre', u.name, 'email', u.email, 'email_verificado', u.email_verified,
                                            'alta', u.created_at, 'desactivado', u.deactivated_at)
                  FROM public.users u WHERE u.id = app.current_user_id()),
      'organizaciones', COALESCE((SELECT jsonb_agg(jsonb_build_object('organizacion', t.name, 'direccion', t.slug, 'rol', m.role,
                                                                      'estado', m.status, 'desde', m.created_at) ORDER BY m.created_at)
                                  FROM public.tenant_memberships m JOIN public.tenants t ON t.id = m.tenant_id
                                  WHERE m.user_id = app.current_user_id()), '[]'::jsonb),
      'sesiones', COALESCE((SELECT jsonb_agg(jsonb_build_object('inicio', s.created_at, 'caduca', s.expires_at, 'ip', s.ip_address,
                                                                'navegador', s.user_agent) ORDER BY s.created_at)
                            FROM public.sessions s WHERE s.user_id = app.current_user_id()), '[]'::jsonb),
      'actividad', COALESCE((SELECT jsonb_agg(jsonb_build_object('fecha', a.occurred_at, 'accion', a.action, 'organizacion', a.tenant_id,
                                                                 'entidad', a.entity_type) ORDER BY a.occurred_at)
                             FROM public.audit_events a WHERE a.actor_user_id = app.current_user_id()), '[]'::jsonb)
    ) END
  $$;

-- Desactivar la propia cuenta: sin acceso (membresías suspendidas, sesiones cerradas, inicio de sesión bloqueado
-- por la capa de autenticación), conservando la autoría en la auditoría y lo fiscal. No se permite dejar una
-- organización activa sin propietario: antes hay que transferir la propiedad.
CREATE FUNCTION app.deactivate_my_account() RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  DECLARE
    v_user uuid := app.current_user_id();
  BEGIN
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'NO_USER: falta el usuario del contexto' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.tenant_memberships m JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = v_user AND m.role = 'OWNER' AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships o
                        WHERE o.tenant_id = m.tenant_id AND o.role = 'OWNER' AND o.status = 'ACTIVE' AND o.user_id <> v_user)
    ) THEN
      RETURN 'SOLE_OWNER';
    END IF;
    UPDATE public.users SET deactivated_at = now(), updated_at = now() WHERE id = v_user AND deactivated_at IS NULL;
    UPDATE public.tenant_memberships SET status = 'SUSPENDED', updated_at = now() WHERE user_id = v_user;
    DELETE FROM public.sessions WHERE user_id = v_user;
    INSERT INTO public.audit_events (actor_user_id, action, entity_type, entity_id, outcome)
      VALUES (v_user, 'user.deactivated', 'user', v_user::text, 'SUCCESS');
    RETURN 'OK';
  END
  $$;

REVOKE ALL ON FUNCTION app.my_personal_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.deactivate_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_personal_data() TO facturalibre_app;
GRANT EXECUTE ON FUNCTION app.deactivate_my_account() TO facturalibre_app;
