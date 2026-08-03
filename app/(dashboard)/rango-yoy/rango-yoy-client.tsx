"use client";
import { useEffect, useState } from "react";
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Metrics = {
  num: number;
  ingresos_total: number;
  ingresos_aloja: number;
  ingresos_extras: number;
  noches_totales: number;
  adr: number;
  ocupacion: number;
  dias: number;
  porCanal: Record<string, number>;
};

type ProdDia = { dia: string; habitaciones_ocupadas: number; ingresos_alojamiento: number; ingresos_complementarios: number; ingresos_total: number };
type AlertaCompl = { complementario_id: string; localizador_externo: string; habitacion: string; concepto: string; cantidad: number; fecha_complementario: string; fecha_in: string; fecha_out: string; importe: number; tipo_discrepancia: string };
type AlertasResp = { total: number; alertas: AlertaCompl[]; error?: string };

type ProdResp = { desde: string; hasta: string; dias: ProdDia[]; totales: { alojamiento: number; complementarios: number; total: number; habitaciones: number }; nota?: string; error?: string; hint?: string };

type Response = {
  desde: string;
  hasta: string;
  desde_anterior: string;
  hasta_anterior: string;
  actual: Metrics;
  anterior: Metrics;
  yoy: Record<string, number>;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function firstOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d;
}

const presets: [string, () => [Date, Date]][] = [
  ["Últimos 7 días", () => [daysAgo(7), new Date()]],
  ["Últimos 30 días", () => [daysAgo(30), new Date()]],
  ["Este mes", () => [firstOfMonth(), lastOfMonth()]],
  ["Mes pasado", () => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return [firstOfMonth(d), lastOfMonth(d)];
  }],
  ["Últimos 90 días", () => [daysAgo(90), new Date()]],
  ["Este año", () => [firstOfYear(), new Date()]],
];

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) {
    return <span className="text-neutral-500 inline-flex items-center gap-1"><Minus className="size-3" /> —</span>;
  }
  const good = value >= 0;
  const Icon = good ? TrendingUp : TrendingDown;
  const cls = good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span className={`inline-flex items-center gap-1 font-medium ${cls}`}><Icon className="size-3" />{good ? "+" : ""}{value.toFixed(1)}%</span>;
}

function money(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function RangoYoYClient() {
  const [desde, setDesde] = useState(iso(firstOfMonth()));
  const [hasta, setHasta] = useState(iso(lastOfMonth()));
  const [data, setData] = useState<Response | null>(null);
  const [prod, setProd] = useState<ProdResp | null>(null);
  const [alertas, setAlertas] = useState<AlertasResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(d: string, h: string) {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/metricas/rango-yoy?desde=${d}&hasta=${h}`).then(r => r.json()),
        fetch(`/api/metricas/produccion-diaria?desde=${d}&hasta=${h}`).then(r => r.json()),
        fetch(`/api/metricas/alertas-complementarios`).then(r => r.json()),
      ]);
      setData(r1);
      setProd(r2);
      setAlertas(r3);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(desde, hasta); /* eslint-disable-next-line */ }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Rangos personalizados · comparativa YoY</h1>
      <p className="text-sm text-neutral-500 mb-6">Elige un periodo cualquiera y ve la comparativa contra el mismo periodo del año anterior.</p>

      {/* Presets + selector */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(([label, fn]) => (
            <button key={label} className="text-xs px-2.5 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
              onClick={() => { const [d, h] = fn(); const dd = iso(d), hh = iso(h); setDesde(dd); setHasta(hh); load(dd, hh); }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border border-neutral-300 dark:border-neutral-700 rounded-md px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-950" />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border border-neutral-300 dark:border-neutral-700 rounded-md px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-950" />
          </div>
          <button className="text-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-1.5 rounded-md hover:opacity-90"
            onClick={() => load(desde, hasta)} disabled={loading}>
            {loading ? "Calculando..." : "Comparar"}
          </button>
          {data && (
            <div className="text-xs text-neutral-500 ml-auto flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              vs {data.desde_anterior} → {data.hasta_anterior}
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Kpi label="Reservas" actual={data.actual.num} anterior={data.anterior.num} yoy={data.yoy.num} fmt={n => String(n)} />
            <Kpi label="Ingresos totales" actual={data.actual.ingresos_total} anterior={data.anterior.ingresos_total} yoy={data.yoy.ingresos_total} fmt={money} />
            <Kpi label="ADR" actual={data.actual.adr} anterior={data.anterior.adr} yoy={data.yoy.adr} fmt={money} />
            <Kpi label="Ocupación" actual={data.actual.ocupacion} anterior={data.anterior.ocupacion} yoy={data.yoy.ocupacion} fmt={n => n.toFixed(1) + "%"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Desglose ingresos</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr><th className="text-left py-1.5 font-medium">Concepto</th><th className="text-right">Actual</th><th className="text-right">Anterior</th><th className="text-right">YoY</th></tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-neutral-100 dark:border-neutral-800/70"><td className="py-1.5">Alojamiento</td><td className="text-right tabular-nums">{money(data.actual.ingresos_aloja)}</td><td className="text-right tabular-nums text-neutral-500">{money(data.anterior.ingresos_aloja)}</td><td className="text-right"><Delta value={data.yoy.ingresos_aloja} /></td></tr>
                  <tr className="border-b border-neutral-100 dark:border-neutral-800/70"><td className="py-1.5">Extras/complementarios</td><td className="text-right tabular-nums">{money(data.actual.ingresos_extras)}</td><td className="text-right tabular-nums text-neutral-500">{money(data.anterior.ingresos_extras)}</td><td className="text-right"><Delta value={data.yoy.ingresos_extras} /></td></tr>
                  <tr><td className="py-1.5 font-medium">Total</td><td className="text-right tabular-nums font-medium">{money(data.actual.ingresos_total)}</td><td className="text-right tabular-nums text-neutral-500">{money(data.anterior.ingresos_total)}</td><td className="text-right"><Delta value={data.yoy.ingresos_total} /></td></tr>
                </tbody>
              </table>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">Reservas por canal</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr><th className="text-left py-1.5 font-medium">Canal</th><th className="text-right">Actual</th><th className="text-right">Anterior</th></tr>
                </thead>
                <tbody className="text-sm">
                  {Array.from(new Set([...Object.keys(data.actual.porCanal), ...Object.keys(data.anterior.porCanal)])).sort().map(k => (
                    <tr key={k} className="border-b border-neutral-100 dark:border-neutral-800/70 last:border-0">
                      <td className="py-1.5 capitalize">{k.replace(/_/g, " ")}</td>
                      <td className="text-right tabular-nums">{data.actual.porCanal[k] || 0}</td>
                      <td className="text-right tabular-nums text-neutral-500">{data.anterior.porCanal[k] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-neutral-500 mt-6">Rango actual: {data.actual.dias} días · Rango anterior: {data.anterior.dias} días · Cálculo sobre las 6 habitaciones reales (excluye "Alojamiento completo" y reservas canceladas/no-show).</p>

          {prod && !prod.error && prod.dias.length > 0 && (
            <div className="mt-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Producción por día · corregida vs bug MrPlan</h3>
                <div className="text-xs text-neutral-500">
                  Total: <span className="font-medium text-neutral-800 dark:text-neutral-200">{money(prod.totales.total)}</span> · {prod.totales.habitaciones} noches vendidas
                </div>
              </div>
              <p className="text-[11px] text-neutral-500 mb-3">
                Alojamiento y complementarios (consumos, cenas, extras) repartidos linealmente entre las noches de estancia real de cada reserva. Ignora el informe agregado de MrPlan que atribuye extras a días equivocados.
              </p>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900">
                    <tr>
                      <th className="text-left py-1.5 font-medium">Día</th>
                      <th className="text-right">Hab. ocup.</th>
                      <th className="text-right">Alojamiento</th>
                      <th className="text-right">Complementarios</th>
                      <th className="text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prod.dias.map((d) => (
                      <tr key={d.dia} className="border-b border-neutral-100 dark:border-neutral-800/70 last:border-0">
                        <td className="py-1.5 tabular-nums">{d.dia}</td>
                        <td className="text-right tabular-nums">{d.habitaciones_ocupadas}/6</td>
                        <td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">{money(Number(d.ingresos_alojamiento))}</td>
                        <td className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">{money(Number(d.ingresos_complementarios))}</td>
                        <td className="text-right tabular-nums font-medium">{money(Number(d.ingresos_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="text-sm border-t border-neutral-300 dark:border-neutral-700 sticky bottom-0 bg-white dark:bg-neutral-900">
                    <tr className="font-medium">
                      <td className="py-1.5">Total periodo</td>
                      <td className="text-right tabular-nums">{prod.totales.habitaciones}</td>
                      <td className="text-right tabular-nums">{money(prod.totales.alojamiento)}</td>
                      <td className="text-right tabular-nums">{money(prod.totales.complementarios)}</td>
                      <td className="text-right tabular-nums">{money(prod.totales.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {prod?.error && (
            <div className="mt-4 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
              ⚠️ Producción diaria no disponible: {prod.error}. {prod.hint ? `(${prod.hint})` : ""}
            </div>
          )}

          {alertas && !alertas.error && alertas.total > 0 && (
            <div className="mt-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                ⚠️ Bug de MrPlan detectado — {alertas.total} complementarios con fecha fuera de la estancia
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
                MrPlan ha atribuido estos consumos a fechas que no coinciden con la estancia real del huésped. Nuestro cálculo los usa igual porque tiene la fecha exacta, pero es evidencia del bug para la reclamación técnica.
              </p>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-neutral-500 border-b border-amber-200 dark:border-amber-900 sticky top-0 bg-amber-50 dark:bg-amber-950/20">
                    <tr>
                      <th className="text-left py-1.5 font-medium">Localizador</th>
                      <th className="text-left font-medium">Habit.</th>
                      <th className="text-left font-medium">Concepto</th>
                      <th className="text-left font-medium">Fecha atribuida</th>
                      <th className="text-left font-medium">Estancia real</th>
                      <th className="text-right font-medium">Importe</th>
                      <th className="text-left font-medium">Discrepancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertas.alertas.map((a) => (
                      <tr key={a.complementario_id} className="border-b border-amber-100 dark:border-amber-900/50 last:border-0">
                        <td className="py-1 font-mono">{a.localizador_externo}</td>
                        <td className="capitalize">{a.habitacion}</td>
                        <td>{a.concepto} <span className="text-neutral-500">×{a.cantidad}</span></td>
                        <td className="text-red-700 dark:text-red-400 tabular-nums">{a.fecha_complementario}</td>
                        <td className="text-neutral-600 tabular-nums">{a.fecha_in} → {a.fecha_out}</td>
                        <td className="text-right tabular-nums">{money(Number(a.importe))}</td>
                        <td className="text-amber-700 dark:text-amber-400">{a.tipo_discrepancia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, actual, anterior, yoy, fmt }: { label: string; actual: number; anterior: number; yoy: number; fmt: (n: number) => string }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-semibold">{fmt(actual)}</div>
      <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
        vs <span className="tabular-nums">{fmt(anterior)}</span> · <Delta value={yoy} />
      </div>
    </div>
  );
}



