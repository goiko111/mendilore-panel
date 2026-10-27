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
    .select("id, forma_pago, canal, anticipo")
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "pendiente"])
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in3)
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);
  // Excluir Booking Payments / pagos OTA (no requieren acción nuestra)
  const cobrosUrg = (cobrosUrgRaw ?? []).filter((r: any) => {
    const fp = (r.forma_pago ?? "").toString().toLowerCase();
    const canal = (r.canal ?? "").toString().toLowerCase();
    if (/booking[\s_-]*payments|virtual[\s_-]*card|virtualcard/i.test(fp)) return false;
    // Booking va por Booking Payments. Web propia y teléfono con anticipo cobrado
    // pagan el resto a la salida; SIN anticipo sí son pendiente real (feedback
    // Juan 10.08, caso Álvaro). Misma regla que la tarjeta del Resumen.
    if (canal === "booking") return false;
    if ((canal === "web_propia" || canal === "telefono") && Number(r.anticipo ?? 0) > 0) return false;
    return true;
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
    // Se compara la MISMA fecha de entrada en dos capturas de días distintos.
    // Antes se comparaban las dos últimas capturas de cada hotel aunque fueran
    // de fechas de entrada diferentes (un martes de noviembre contra un sábado
    // de diciembre), y el aviso saltaba casi todos los días sin motivo.
    const { data: snaps } = await supabase
      .from("precios_competidores_dia")
      .select("competidor_id, check_in, fecha_snapshot, precio_por_noche, disponible")
      .gte("fecha_snapshot", ayer)
      .gte("check_in", todayStr)
      .order("fecha_snapshot", { ascending: false });
    const porVentana = new Map<string, any[]>();
    (snaps ?? []).forEach((s: any) => {
      if (!s.disponible || !s.precio_por_noche || !s.check_in) return;
      const k = `${s.competidor_id}|${s.check_in}`;
      const arr = porVentana.get(k) ?? [];
      arr.push(s);
      porVentana.set(k, arr);
    });
    const conCambio = new Set<string>();
    porVentana.forEach((arr) => {
      const actual = arr[0];
      const previo = arr.find((x: any) => x.fecha_snapshot !== actual.fecha_snapshot);
      if (!previo) return;
      const delta = Math.abs((Number(actual.precio_por_noche) - Number(previo.precio_por_noche)) / Number(previo.precio_por_noche)) * 100;
      if (delta >= 15) conCambio.add(actual.competidor_id);
    });
    const cambios = conCambio.size;
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

