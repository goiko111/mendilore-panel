"use client";
import { useEffect, useState } from "react";
import { Wallet, Clock, CreditCard, CheckCircle2 } from "lucide-react";
import { canalLabel } from "@/lib/constants";
import { KPITooltip, type KPITooltipProps } from "@/components/kpi-tooltip";

type ResumenRow = {
  clasificacion: string;
  descripcion: string;
  num_reservas: number;
  importe_total: number;
  ya_cobrado: number;
  por_cobrar: number;
};
type DetalleRow = {
  id: string; huesped: string; habitacion: string;
  fecha_in: string; fecha_out: string; canal: string;
  importe_total: number; ya_cobrado: number; por_cobrar: number;
  clasificacion: string; descripcion: string;
};
type Resp = { resumen: ResumenRow[]; detalle: DetalleRow[]; error?: string; hint?: string };

const money = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n) || 0);

// Textos de ayuda de cada tarjeta (feedback Juan 10.08: no tenían la «i»).
// Periodo de las tarjetas: reservas con salida en los últimos 90 días y todas las futuras.
const ORIGEN = "Ficha de cada reserva en MisterPlan: Anticipo y Pendiente de cobro.";
const SISTEMAS = "MisterPlan → robot → BD del panel (vista clasificacion_cobros).";

const META: Record<string, { label: string; Icon: any; cls: string; chip: string; tooltip: KPITooltipProps }> = {
  pendiente_gestion: {
    label: "Pendiente de gestión",
    Icon: Clock,
    tooltip: { mide: "Reservas con importe por cobrar que necesitan acción vuestra: no son de Booking y no tienen ningún anticipo cobrado.", calculo: "Pendiente de cobro > 0, canal distinto de Booking y anticipo = 0. Salida en los últimos 90 días o futura.", origen: ORIGEN, sistemas: SISTEMAS },
    cls: "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20",
    chip: "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  },
  anticipo_web: {
    label: "Anticipo cobrado",
    Icon: Wallet,
    tooltip: { mide: "Reservas con un anticipo ya cobrado y el resto pendiente, que se paga a la salida. Se usa el anticipo real de la ficha, no un 50 % fijo.", calculo: "Anticipo > 0 y pendiente de cobro > 0, canal distinto de Booking. Salida en los últimos 90 días o futura.", origen: ORIGEN, sistemas: SISTEMAS },
    cls: "border-sky-300 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/20",
    chip: "bg-sky-200 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  },
  prepago_ota: {
    label: "Prepago OTA",
    Icon: CreditCard,
    tooltip: { mide: "Reservas de Booking con importe pendiente: lo cobra Booking (Booking Payments) y os lo abona después de la salida.", calculo: "Canal Booking y pendiente de cobro > 0. Salida en los últimos 90 días o futura.", origen: ORIGEN, sistemas: SISTEMAS },
    cls: "border-violet-300 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/20",
    chip: "bg-violet-200 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  },
  cobrado: {
    label: "Cobrado",
    Icon: CheckCircle2,
    tooltip: { mide: "Reservas cobradas por completo.", calculo: "Estado de cobro «cobrado» en MisterPlan o pendiente de cobro = 0. Salida en los últimos 90 días o futura.", origen: ORIGEN, sistemas: SISTEMAS },
    cls: "border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20",
    chip: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  },
};

export function TesoreriaBlock() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/tesoreria", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!data || data.error) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 mb-4">
        Tesorería no disponible{data?.hint ? ` — ${data.hint}` : ""}.
      </div>
    );
  }

  const detalleFiltrado = filtro
    ? data.detalle.filter((d) => d.clasificacion === filtro)
    : data.detalle;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">💶 Tesorería — estado real de los cobros</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Solo <strong>Pendiente de gestión</strong> requiere acción vuestra. Prepago OTA y Anticipo cobrado están
        garantizados: se cobran solos, pero los mostramos para el seguimiento de tesorería.
        {" "}<span className="font-medium">Periodo: reservas con salida en los últimos 90 días + todas las futuras.</span>
        {" "}El "Anticipo cobrado" solo se asigna cuando hay un anticipo real cobrado en MisterPlan.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {data.resumen.map((r) => {
          const meta = META[r.clasificacion] ?? META.cobrado;
          const activo = filtro === r.clasificacion;
          return (
            <div
              key={r.clasificacion}
              role="button"
              tabIndex={0}
              onClick={() => setFiltro(activo ? null : r.clasificacion)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFiltro(activo ? null : r.clasificacion); } }}
              className={`text-left rounded-xl border p-3 transition ${meta.cls} ${activo ? "ring-2 ring-offset-1 ring-neutral-400 dark:ring-neutral-600" : "hover:opacity-90"}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <meta.Icon className="size-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
                <KPITooltip {...meta.tooltip} />
              </div>
              <div className="text-xl font-semibold tabular-nums">{money(r.importe_total)}</div>
              <div className="text-[11px] mt-0.5 opacity-80">
                {r.num_reservas} reserva{r.num_reservas === 1 ? "" : "s"}
                {Number(r.por_cobrar) > 0 && (
                  <> · queda <strong className="tabular-nums">{money(r.por_cobrar)}</strong></>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detalleFiltrado.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              {filtro ? META[filtro]?.label : "Todas las reservas activas"} · {detalleFiltrado.length} reserva(s)
            </span>
            {filtro && (
              <button onClick={() => setFiltro(null)} className="underline hover:no-underline">
                ver todas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-background sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-1.5 font-medium">Huésped</th>
                  <th className="text-left font-medium">Habitación</th>
                  <th className="text-left font-medium">Entrada</th>
                  <th className="text-left font-medium">Canal</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-right font-medium">Cobrado</th>
                  <th className="text-right font-medium">Queda</th>
                  <th className="text-left font-medium pr-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {detalleFiltrado.map((d) => {
                  const meta = META[d.clasificacion] ?? META.cobrado;
                  return (
                    <tr key={d.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-1.5">{d.huesped}</td>
                      <td className="capitalize">{d.habitacion}</td>
                      <td className="tabular-nums">{d.fecha_in}</td>
                      <td>{canalLabel(d.canal)}</td>
                      <td className="text-right tabular-nums">{money(d.importe_total)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{money(d.ya_cobrado)}</td>
                      <td className="text-right tabular-nums font-medium">{money(d.por_cobrar)}</td>
                      <td className="pr-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

