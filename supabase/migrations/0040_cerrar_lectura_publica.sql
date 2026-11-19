-- Migration 0040 · Cerrar la lectura pública de vistas y del registro
-- ---------------------------------------------------------------------------
-- Encontrado el 19/11 al aplicar la 0039. La clave publicable de Supabase va
-- en la web (lib/supabase/client.ts, la usa la página de login), así que
-- cualquiera puede llamar a la API REST como rol `anon`. Con ella se leían:
--
-- 1) Seis vistas de `public`. Son de `postgres` (que salta RLS) y no tenían
--    `security_invoker`, así que devolvían todas las filas aunque las tablas
--    de debajo tengan RLS. Entre ellas `reservas_pendientes_firma` (nombre y
--    email del huésped) y `clasificacion_cobros` (nombre, importes, por cobrar).
-- 2) `logs_actividad`: política `logs_select_all` para el rol public con
--    `using (true)` (emails de usuario, IP, user agent, detalles).
-- 3) `aceptaciones_condiciones`: igual (`aceptaciones_select_all`, public,
--    true). Vacía el 19/11 porque aún no se ha firmado nada; con la primera
--    firma se habría visto. /aceptar y su API usan la clave de servicio.
--
-- El panel no usa `anon` para nada de esto: las rutas que leen estas vistas
-- usan la clave de servicio (salta RLS) y las páginas con sesión leen como
-- `authenticated`, que tiene políticas de lectura en reservas, huespedes y
-- reserva_complementarios. `documentos_legales` sigue siendo pública a
-- propósito (textos que lee el huésped en /aceptar).

-- (1) Las vistas aplican los permisos de quien consulta, no los del dueño
ALTER VIEW public.produccion_dia                         SET (security_invoker = on);
ALTER VIEW public.metricas_dia                           SET (security_invoker = on);
ALTER VIEW public.clasificacion_cobros                   SET (security_invoker = on);
ALTER VIEW public.resumen_tesoreria                      SET (security_invoker = on);
ALTER VIEW public.reservas_pendientes_firma              SET (security_invoker = on);
ALTER VIEW public.alertas_complementarios_fuera_estancia SET (security_invoker = on);

-- y `anon` deja de tener permiso sobre ellas
REVOKE ALL ON public.produccion_dia,
              public.metricas_dia,
              public.clasificacion_cobros,
              public.resumen_tesoreria,
              public.reservas_pendientes_firma,
              public.alertas_complementarios_fuera_estancia
  FROM anon;

-- (2) El registro solo lo leen usuarios con sesión
DROP POLICY IF EXISTS logs_select_all ON public.logs_actividad;
CREATE POLICY logs_select_authenticated ON public.logs_actividad
  FOR SELECT TO authenticated USING (true);

-- (3) Las aceptaciones firmadas, igual
DROP POLICY IF EXISTS aceptaciones_select_all ON public.aceptaciones_condiciones;
CREATE POLICY aceptaciones_select_authenticated ON public.aceptaciones_condiciones
  FOR SELECT TO authenticated USING (true);

-- Comprobación: ninguna vista de public legible por anon ni sin security_invoker
SELECT c.relname,
       coalesce(array_to_string(c.reloptions, ','), '(ninguna)') AS opciones,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_lee
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
ORDER BY 1;
