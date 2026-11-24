-- Una sola fuente de verdad para el acceso de un usuario a un contribuyente.
-- Sustituye la lógica duplicada de can_access_taxpayer / can_write_taxpayer (migración 20261124000100).
-- Las políticas RLS existentes siguen llamando a las mismas funciones; su comportamiento no cambia.

-- Nivel de acceso del usuario del contexto al contribuyente, dentro del tenant del contexto:
--   'FULL' (alcance ALL_TAXPAYERS o asignación FULL), 'READ_ONLY' (asignación de solo lectura) o NULL (sin acceso).
CREATE FUNCTION app.taxpayer_access_level(p_taxpayer_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT CASE
             WHEN m.taxpayer_scope = 'ALL_TAXPAYERS' THEN 'FULL'
             ELSE tm.access_level::text
           END
    FROM public.tenant_memberships m
    JOIN public.taxpayers tp ON tp.tenant_id = m.tenant_id AND tp.id = p_taxpayer_id
    LEFT JOIN public.taxpayer_memberships tm
      ON tm.tenant_id = m.tenant_id AND tm.taxpayer_id = p_taxpayer_id AND tm.user_id = m.user_id
    WHERE m.tenant_id = app.current_tenant_id()
      AND m.user_id = app.current_user_id()
      AND m.status = 'ACTIVE'
  $$;

CREATE OR REPLACE FUNCTION app.can_access_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app.taxpayer_access_level(p_taxpayer_id) IS NOT NULL $$;

CREATE OR REPLACE FUNCTION app.can_write_taxpayer(p_taxpayer_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(app.taxpayer_access_level(p_taxpayer_id) = 'FULL', false) $$;

REVOKE ALL ON FUNCTION app.taxpayer_access_level(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.taxpayer_access_level(uuid) TO facturalibre_app, facturalibre_worker;
