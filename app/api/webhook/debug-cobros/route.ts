/**
 * GET /api/webhook/debug-cobros?secret=...
 * Devuelve estadísticas de cobros pendientes para diagnosticar el filtro Booking Payments:
 *  - formas_pago únicas y conteo
 *  - canales únicos en pendientes
 *  - reservas que actualmente aparecen en pendientes con detalle
 *
 * TEMPORAL — eliminar tras verificar.
 */
export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const SECRET = "mendilore-debug-2026-06-22-cobros";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0,10);

  // 1) Distribución de forma_pago entre las reservas
  const { data: all } = await supabase
    .from("reservas")
    .select("forma_pago, canal, estado_cobro, estado_reserva, habitacion, fecha_in, fecha_out, importe_total, huespedes(nombre, apellidos)")
    .limit(500);

  const formasPago = new Map<string, number>();
  const canales = new Map<string, number>();
  (all ?? []).forEach((r: any) => {
    const fp = r.forma_pago ?? "(null)";
    formasPago.set(fp, (formasPago.get(fp) ?? 0) + 1);
    const c = r.canal ?? "(null)";
    canales.set(c, (canales.get(c) ?? 0) + 1);
  });

  // 2) Las que aparecen hoy como PENDIENTES (cualquier fecha)
  const pendientes = (all ?? []).filter((r: any) => r.estado_cobro === "pendiente");
  const pendientesActivas = pendientes.filter((r: any) =>
    r.estado_reserva !== "cancelada" &&
    r.estado_reserva !== "no_show" &&
    r.fecha_out >= today
  );

  return NextResponse.json({
    formas_pago_distribucion: Object.fromEntries([...formasPago].sort((a,b)=>b[1]-a[1])),
    canales_distribucion: Object.fromEntries([...canales].sort((a,b)=>b[1]-a[1])),
    pendientes_total: pendientes.length,
    pendientes_activas_hoy: pendientesActivas.length,
    pendientes_ejemplos: pendientesActivas.slice(0, 20).map((r: any) => ({
      huesped: (r.huespedes?.nombre ?? '') + ' ' + (r.huespedes?.apellidos ?? ''),
      habitacion: r.habitacion,
      fecha_in: r.fecha_in,
      fecha_out: r.fecha_out,
      importe: r.importe_total,
      canal: r.canal,
      forma_pago: r.forma_pago,
      estado_reserva: r.estado_reserva,
      estado_cobro: r.estado_cobro
    }))
  });
}
