"use client";
import { useEffect, useState } from "react";
import { Wallet, Clock, CreditCard, CheckCircle2 } from "lucide-react";

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

const META: Record<string, { label: string; Icon: any; cls: string; chip: string }> = {
  pendiente_gestion: {
    label: "Pendiente de gestión",
    Icon: Clock,
    cls: "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20",
    chip: "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  },
  anticipo_web: {
    label: "Anticipo web (50%)",
    Icon: Wallet,
    cls: "border-sky-300 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/20",
    chip: "bg-sky-200 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  },
  prepago_ota: {
    label: "Prepago OTA",
    Icon: CreditCard,
    cls: "border-violet-300 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/20",
    chip: "bg-violet-200 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  },
  cobrado: {
    label: "Cobrado",
    Icon: CheckCircle2,
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
        Solo <strong>Pendiente de gestión</strong> requiere acción vuestra. Prepago OTA y Anticipo web están
        garantizados: se cobran solos, pero los mostramos para el seguimiento de tesorería.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {data.resumen.map((r) => {
          const meta = META[r.clasificacion] ?? META.cobrado;
          const activo = filtro === r.clasificacion;
          return (
            <button
              key={r.clasificacion}
              onClick={() => setFiltro(activo ? null : r.clasificacion)}
              className={`text-left rounded-xl border p-3 transition ${meta.cls} ${activo ? "ring-2 ring-offset-1 ring-neutral-400 dark:ring-neutral-600" : "hover:opacity-90"}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <meta.Icon className="size-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
              </div>
              <div className="text-xl font-semibold tabular-nums">{money(r.importe_total)}</div>
              <div className="text-[11px] mt-0.5 opacity-80">
                {r.num_reservas} reserva{r.num_reservas === 1 ? "" : "s"}
                {Number(r.por_cobrar) > 0 && (
                  <> · queda <strong className="tabular-nums">{money(r.por_cobrar)}</strong></>
                )}
              </div>
            </button>
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
                      <td className="capitalize">{(d.canal || "").replace(/_/g, " ")}</td>
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
