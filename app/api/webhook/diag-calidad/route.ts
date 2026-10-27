export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// TEMPORAL · diagnóstico de calidad de datos. Borrar al cerrar el proyecto.
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const HABS = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"];

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({ e: "x" }, { status: 401 });
  // Reservas no refrescadas desde esta fecha = no vistas en la última pasada completa
  const corte = u.searchParams.get("corte") || new Date(Date.now() - 36 * 3600e3).toISOString();

  const s = createAdminClient();
  const filas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await s
      .from("reservas")
      .select("id,id_externo_misterplan,habitacion,fecha_in,fecha_out,noches,canal,estado_reserva,estado_cobro,importe_alojamiento,importe_complementarios,importe_total,fecha_reserva,creado_en,actualizado_en,huesped_id")
      .range(desde, desde + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const contar = (k: string) => filas.reduce((m: Record<string, number>, r) => { const v = String(r[k] ?? "null"); m[v] = (m[v] || 0) + 1; return m; }, {});

  // Habitación-noche ocupada dos veces / días con más de 6
  const ocup = new Map<string, string[]>();
  for (const r of filas) {
    if (["cancelada", "no_show"].includes(r.estado_reserva) || !HABS.includes(r.habitacion)) continue;
    for (let d = new Date(r.fecha_in); d < new Date(r.fecha_out); d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      const arr = ocup.get(k) ?? []; arr.push(r.habitacion + "#" + r.id_externo_misterplan); ocup.set(k, arr);
    }
  }
  const diasImposibles: any[] = [];
  const dobles: any[] = [];
  for (const [dia, arr] of ocup) {
    const porHab = new Map<string, string[]>();
    for (const x of arr) { const [h, id] = x.split("#"); const a = porHab.get(h) ?? []; a.push(id); porHab.set(h, a); }
    if (porHab.size > 6 || arr.length > 6) diasImposibles.push({ dia, filas: arr.length });
    for (const [h, ids] of porHab) if (ids.length > 1) dobles.push({ dia, habitacion: h, reservas: ids });
  }

  const activas = filas.filter((r) => !["cancelada", "no_show"].includes(r.estado_reserva));
  const noRefrescadas = activas
    .filter((r) => (r.actualizado_en ?? "") < corte)
    .map((r) => ({ id: r.id_externo_misterplan, hab: r.habitacion, in: r.fecha_in, out: r.fecha_out, total: r.importe_total, act: r.actualizado_en }))
    .sort((a, b) => (a.in < b.in ? -1 : 1));

  const fechaReservaFalsa = activas.filter((r) => (r.fecha_reserva ?? "").slice(0, 10) === r.fecha_in).length;
  const fechaReservaNula = activas.filter((r) => !r.fecha_reserva).length;

  // Huéspedes con el mismo nombre normalizado
  const hs: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await s.from("huespedes").select("id,nombre,apellidos,email").range(i, i + 999);
    hs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const conReserva = new Set(activas.map((r) => r.huesped_id).filter(Boolean));
  const huerfanos = hs.filter((h) => !conReserva.has(h.id)).length;
  const norm = (x: string) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const porNombre = new Map<string, any[]>();
  for (const h of hs ?? []) { const k = norm(`${h.nombre ?? ""} ${h.apellidos ?? ""}`).split(" ").slice(0, 2).join(" "); if (!k) continue; const a = porNombre.get(k) ?? []; a.push({ id: h.id, email: h.email }); porNombre.set(k, a); }
  const huespedesDuplicados = Array.from(porNombre.entries()).filter(([, a]) => a.length > 1).map(([nombre, a]) => ({ nombre, n: a.length, emails: a.map((x) => x.email) }));

  return NextResponse.json({
    total_filas: filas.length,
    reservas_distintas: new Set(filas.map((r) => r.id_externo_misterplan)).size,
    por_estado_reserva: contar("estado_reserva"),
    por_estado_cobro: contar("estado_cobro"),
    por_canal: contar("canal"),
    por_habitacion: contar("habitacion"),
    dias_imposibles: diasImposibles.length, dias_imposibles_detalle: diasImposibles.slice(0, 20),
    habitacion_noche_doble: dobles.length, habitacion_noche_doble_detalle: dobles.slice(0, 30),
    corte_refresco: corte,
    no_refrescadas: noRefrescadas.length, no_refrescadas_detalle: noRefrescadas.slice(0, 80),
    fecha_reserva_igual_a_entrada: fechaReservaFalsa, fecha_reserva_nula: fechaReservaNula,
    huespedes: hs.length, huespedes_con_reserva_activa: conReserva.size, huespedes_sin_reserva: huerfanos, huespedes_duplicados: huespedesDuplicados.length, huespedes_duplicados_detalle: huespedesDuplicados.slice(0, 30),
  }, { headers: { "cache-control": "no-store" } });
}
