export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { HABITACIONES_VALIDAS } from "@/lib/constants";

type Alerta = {
  tipo: "cobro" | "sabanas" | "legal" | "competencia" | "scraper";
  severidad: "info" | "warning" | "critica";
  titulo: string;
  detalle: string;
  href?: string;
};

export async function GET() {
  const supabase = createAdminClient();
  const alertas: Alerta[] = [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in3 = new Date(today.getTime() + 3 * 86400_000).toISOString().slice(0, 10);

  // 1) Cobros próximos a vencer (3 días) — solo los que requieren ACCIÓN nuestra
  const { data: cobrosUrgRaw } = await supabase
    .from("reservas")
    .select("id, forma_pago")
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "pendiente"])
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in3)
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);
  // Excluir Booking Payments / pagos OTA (no requieren acción nuestra)
  const cobrosUrg = (cobrosUrgRaw ?? []).filter((r: any) => {
    const fp = (r.forma_pago ?? "").toString().toLowerCase();
    return !/booking[\s_-]*payments|virtual[\s_-]*card|virtualcard/i.test(fp);
  }).length;
  if ((cobrosUrg ?? 0) > 0) {
    alertas.push({
      tipo: "cobro",
      severidad: "critica",
      titulo: `${cobrosUrg} cobros pendientes próximos a vencer`,
      detalle: "Reservas con entrada en los próximos 3 días sin cobrar.",
      href: "/reservas"
    });
  }

  // 2) Reservas con check-in hoy/mañana sin firma legal aceptada
  const in1 = new Date(today.getTime() + 86400_000).toISOString().slice(0, 10);
  const { data: reservasProx } = await supabase
    .from("reservas")
    .select("id")
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in1);
  const idsProx = (reservasProx ?? []).map((r: any) => r.id);
  if (idsProx.length > 0) {
    const { data: firmadas } = await supabase
      .from("aceptaciones_condiciones")
      .select("reserva_id")
      .in("reserva_id", idsProx);
    const firmadasSet = new Set((firmadas ?? []).map((f: any) => f.reserva_id));
    const sinFirma = idsProx.filter((id) => !firmadasSet.has(id));
    if (sinFirma.length > 0) {
      alertas.push({
        tipo: "legal",
        severidad: "warning",
        titulo: `${sinFirma.length} reserva(s) sin firma legal`,
        detalle: "Check-in inminente sin condiciones aceptadas. Envía el enlace legal desde Reservas.",
        href: "/reservas"
      });
    }
  }

  // 3) Housekeeping pendiente (4+ noches sin cambio de sábanas — ajustado por Juan)
  try {
    const { data: hk } = await supabase.rpc("calcular_housekeeping_pendiente");
    const pendientesSabanas = (hk ?? []).filter((h: any) => (h.noches_desde_ultimo_cambio_sabanas ?? 0) >= 4);
    if (pendientesSabanas.length > 0) {
      alertas.push({
        tipo: "sabanas",
        severidad: "info",
        titulo: `${pendientesSabanas.length} habitación(es) necesitan cambio de sábanas`,
        detalle: pendientesSabanas.map((h: any) => h.habitacion).join(", "),
        href: "/dashboard"
      });
    }
  } catch { /* migration aún no aplicada */ }

  // 4) Cambios drásticos en competencia (≥15% últimas 24h)
  try {
    const ayer = new Date(today.getTime() - 86400_000).toISOString().slice(0, 10);
    const { data: snaps } = await supabase
      .from("precios_competidores_dia")
      .select("competidor_id, fecha_snapshot, precio_por_noche, disponible")
      .gte("fecha_snapshot", ayer)
      .order("fecha_snapshot", { ascending: false });
    const porComp = new Map<string, any[]>();
    (snaps ?? []).forEach((s: any) => {
      if (!s.disponible || !s.precio_por_noche) return;
      const arr = porComp.get(s.competidor_id) ?? [];
      arr.push(s);
      porComp.set(s.competidor_id, arr);
    });
    let cambios = 0;
    porComp.forEach((arr) => {
      if (arr.length < 2) return;
      const delta = Math.abs((Number(arr[0].precio_por_noche) - Number(arr[1].precio_por_noche)) / Number(arr[1].precio_por_noche)) * 100;
      if (delta >= 15) cambios++;
    });
    if (cambios > 0) {
      alertas.push({
        tipo: "competencia",
        severidad: "info",
        titulo: `${cambios} competidor(es) con cambio drástico de precio`,
        detalle: "Variación ≥15% en las últimas 24h. Revisa en Competencia.",
        href: "/competencia"
      });
    }
  } catch { /* sin snapshots o BD vacía */ }

  return NextResponse.json({ alertas });
}
