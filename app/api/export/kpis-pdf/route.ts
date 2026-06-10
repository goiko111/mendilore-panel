export const runtime = 'edge';

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Endpoint que genera un HTML imprimible (PDF-ready) con los KPIs del mes solicitado.
// El navegador renderiza este HTML y el usuario hace Ctrl+P (o Cmd+P) → "Guardar como PDF".
// Es la forma más fiable y barata en CF Pages Edge (no requiere Puppeteer/Chromium en runtime).
// URL: /api/export/kpis-pdf?ym=2026-05 (default: mes anterior completo)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ymParam = url.searchParams.get("ym");

  const today = new Date();
  const defaultYM = (() => {
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  })();
  const ym = ymParam ?? defaultYM;
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    return new Response("Parámetro ym inválido (formato esperado YYYY-MM)", { status: 400 });
  }

  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDayDate = new Date(y, m, 0);
  const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;
  const monthLabel = new Date(firstDay + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const supabase = createAdminClient();

  // KPIs del mes
  const { data: metricas } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", firstDay)
    .lte("fecha", lastDay)
    .order("fecha", { ascending: true });

  // Reservas del mes (check-in dentro del mes)
  const { data: reservasMes } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, noches, importe_total, canal, estado_cobro, huespedes(nombre, apellidos)")
    .gte("fecha_in", firstDay)
    .lte("fecha_in", lastDay)
    .neq("estado_cobro", "cancelado")
    .order("fecha_in", { ascending: true });

  // Agregados
  const ingresos = (metricas ?? []).reduce((s, m) => s + Number(m.ingresos_dia ?? 0), 0);
  const noches = (metricas ?? []).reduce((s, m) => s + Number(m.habitaciones_ocupadas ?? 0), 0);
  const occMedia = metricas?.length ? metricas.reduce((s, m) => s + Number(m.occupancy_pct ?? 0), 0) / metricas.length : 0;
  const adr = noches > 0 ? ingresos / noches : 0;
  const revpar = metricas?.length ? metricas.reduce((s, m) => s + Number(m.revpar ?? 0), 0) / metricas.length : 0;
  const cancelaciones = (reservasMes ?? []).filter(r => r.estado_cobro === "cancelado").length;

  // Channel mix
  const canalMap = new Map<string, { count: number; revenue: number }>();
  (reservasMes ?? []).forEach(r => {
    const k = (r.canal as string) || "Sin canal";
    const acc = canalMap.get(k) ?? { count: 0, revenue: 0 };
    acc.count += 1;
    acc.revenue += Number(r.importe_total ?? 0);
    canalMap.set(k, acc);
  });
  const channelMix = Array.from(canalMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue);

  // Top huéspedes por gasto en el mes
  const huespedMap = new Map<string, { nombre: string; gasto: number; reservas: number }>();
  (reservasMes ?? []).forEach((r: any) => {
    const nom = r.huespedes ? `${r.huespedes.nombre ?? ""} ${r.huespedes.apellidos ?? ""}`.trim() : "—";
    const key = nom || "—";
    const acc = huespedMap.get(key) ?? { nombre: key, gasto: 0, reservas: 0 };
    acc.gasto += Number(r.importe_total ?? 0);
    acc.reservas += 1;
    huespedMap.set(key, acc);
  });
  const topHuespedes = Array.from(huespedMap.values()).sort((a, b) => b.gasto - a.gasto).slice(0, 5);

  const fmtEur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>KPIs Casa Mendilore — ${monthLabel}</title>
<style>
  @media print { @page { size: A4; margin: 18mm; } body { -webkit-print-color-adjust: exact; } .no-print { display: none; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.4; }
  h1 { font-size: 22px; margin: 0 0 4px 0; color: #2d4f2d; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin: 28px 0 10px 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
  .kpi-value { font-size: 22px; font-weight: 600; margin-top: 4px; color: #1a1a1a; }
  .kpi-hint { font-size: 11px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px 0; font-size: 13px; }
  th { background: #f8f9fa; text-align: left; padding: 8px 10px; font-weight: 600; color: #4b5563; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  .print-btn { background: #2d4f2d; color: white; padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
</style>
</head>
<body>
  <div class="no-print" style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
    <strong>📄 Esto es un informe imprimible.</strong> Para guardarlo como PDF: pulsa <strong>Ctrl+P</strong> (Windows) o <strong>Cmd+P</strong> (Mac) → "Guardar como PDF".
    <br/><button class="print-btn no-print" style="margin-top: 8px;" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  </div>

  <h1>Casa Mendilore — Informe ${monthLabel}</h1>
  <div class="sub">KPIs operacionales del mes · Generado ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</div>

  <h2>Indicadores principales</h2>
  <div class="grid">
    <div class="kpi"><div class="kpi-label">Ocupación media</div><div class="kpi-value">${fmtPct(occMedia)}</div><div class="kpi-hint">${noches} noches vendidas</div></div>
    <div class="kpi"><div class="kpi-label">ADR medio</div><div class="kpi-value">${fmtEur(adr)}</div><div class="kpi-hint">Tarifa por habitación</div></div>
    <div class="kpi"><div class="kpi-label">RevPAR medio</div><div class="kpi-value">${fmtEur(revpar)}</div><div class="kpi-hint">Ingreso/hab. disponible</div></div>
    <div class="kpi"><div class="kpi-label">Ingresos mes</div><div class="kpi-value">${fmtEur(ingresos)}</div><div class="kpi-hint">${reservasMes?.length ?? 0} reservas · ${cancelaciones} canceladas</div></div>
  </div>

  <h2>Distribución por canal</h2>
  <table>
    <thead><tr><th>Canal</th><th class="right">Reservas</th><th class="right">Ingresos</th><th class="right">% del total</th></tr></thead>
    <tbody>
      ${channelMix.map(([canal, v]) => {
        const pct = ingresos > 0 ? (v.revenue / ingresos) * 100 : 0;
        return `<tr><td>${canal}</td><td class="right">${v.count}</td><td class="right">${fmtEur(v.revenue)}</td><td class="right">${pct.toFixed(1)}%</td></tr>`;
      }).join("") || `<tr><td colspan="4" style="color: #9ca3af; text-align: center; padding: 20px;">Sin reservas en este período</td></tr>`}
    </tbody>
  </table>

  <h2>Top 5 huéspedes del mes (por gasto)</h2>
  <table>
    <thead><tr><th>Huésped</th><th class="right">Reservas</th><th class="right">Gasto total</th></tr></thead>
    <tbody>
      ${topHuespedes.map(h => `<tr><td>${h.nombre}</td><td class="right">${h.reservas}</td><td class="right">${fmtEur(h.gasto)}</td></tr>`).join("") || `<tr><td colspan="3" style="color: #9ca3af; text-align: center; padding: 20px;">Sin huéspedes en este período</td></tr>`}
    </tbody>
  </table>

  <h2>Listado completo de reservas del mes</h2>
  <table>
    <thead><tr><th>Huésped</th><th>Habitación</th><th>Entrada</th><th>Salida</th><th class="right">Noches</th><th class="right">Importe</th><th>Canal</th></tr></thead>
    <tbody>
      ${(reservasMes ?? []).map((r: any) => `<tr>
        <td>${r.huespedes ? `${r.huespedes.nombre ?? ""} ${r.huespedes.apellidos ?? ""}`.trim() : "—"}</td>
        <td style="text-transform: capitalize;">${r.habitacion}</td>
        <td>${r.fecha_in}</td>
        <td>${r.fecha_out}</td>
        <td class="right">${r.noches}</td>
        <td class="right">${fmtEur(Number(r.importe_total ?? 0))}</td>
        <td>${r.canal ?? "—"}</td>
      </tr>`).join("") || `<tr><td colspan="7" style="color: #9ca3af; text-align: center; padding: 20px;">Sin reservas en este período</td></tr>`}
    </tbody>
  </table>

  <div class="footer">
    Casa Mendilore — Hondarribia · Código registro turístico XSS00159 (Gobierno Vasco)<br/>
    Informe automatizado generado por panel.mendilore.com · GUGO Creative SL
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
