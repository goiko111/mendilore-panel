export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Calendario" };

const HABITACIONES = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"];

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const sp = await searchParams;
  const startStr = sp.start || new Date().toISOString().slice(0, 10);
  const startDate = new Date(startStr);
  const DAYS = 30;
  const endDate = new Date(startDate.getTime() + DAYS * 86400_000);
  const endStr = endDate.toISOString().slice(0, 10);

  // Días del rango
  const dias: { fecha: string; label: string; weekday: string; weekend: boolean }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(startDate.getTime() + i * 86400_000);
    dias.push({
      fecha: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      weekday: d.toLocaleDateString("es-ES", { weekday: "short" }),
      weekend: d.getDay() === 0 || d.getDay() === 6
    });
  }

  const supabase = await createClient();
  const { data: reservas } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, importe_total, importe_moneda, huespedes(nombre, apellidos)")
    .or(`fecha_in.lte.${endStr},fecha_out.gte.${startStr}`)
    .neq("estado_cobro", "cancelado")
    .limit(500);

  // Mapa hab -> fecha -> reserva
  const mapa = new Map<string, Map<string, any>>();
  HABITACIONES.forEach(h => mapa.set(h, new Map()));
  (reservas ?? []).forEach((r: any) => {
    const habMap = mapa.get(r.habitacion?.toLowerCase());
    if (!habMap) return;
    const inDate = new Date(r.fecha_in);
    const outDate = new Date(r.fecha_out);
    for (let d = new Date(inDate); d < outDate; d = new Date(d.getTime() + 86400_000)) {
      const ds = d.toISOString().slice(0, 10);
      if (ds >= startStr && ds < endStr) {
        habMap.set(ds, r);
      }
    }
  });

  const prevStart = new Date(startDate.getTime() - DAYS * 86400_000).toISOString().slice(0, 10);
  const nextStart = new Date(startDate.getTime() + DAYS * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Calendario"
        description={`Ocupación por habitación · ${formatRangeLabel(startDate, endDate)}`}
      />

      <div className="flex items-center gap-2 mb-4">
        <Link href={`/calendario?start=${prevStart}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">
          <ChevronLeft className="size-4" /> Anterior
        </Link>
        <Link href={`/calendario?start=${today}`} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Hoy</Link>
        <Link href={`/calendario?start=${nextStart}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">
          Siguiente <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${100 + DAYS * 32}px` }}>
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/60 z-10 min-w-[100px]">Habitación</th>
              {dias.map((d) => (
                <th key={d.fecha} className={`px-1 py-2 text-center font-normal ${d.weekend ? "bg-amber-50/40 dark:bg-amber-950/20" : ""} ${d.fecha === today ? "bg-emerald-100 dark:bg-emerald-950/40 font-semibold" : ""}`} style={{ width: "32px" }}>
                  <div className="text-[10px] uppercase text-muted-foreground">{d.weekday.charAt(0)}</div>
                  <div className="text-foreground tabular-nums">{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HABITACIONES.map((hab) => {
              const habMap = mapa.get(hab) ?? new Map();
              return (
                <tr key={hab} className="border-t border-border">
                  <td className="px-3 py-2 capitalize font-medium sticky left-0 bg-card z-10">{hab}</td>
                  {dias.map((d) => {
                    const r = habMap.get(d.fecha);
                    const startsHere = r && r.fecha_in === d.fecha;
                    return (
                      <td key={d.fecha} className={`px-0 py-1 text-center ${d.weekend && !r ? "bg-amber-50/30 dark:bg-amber-950/10" : ""} ${d.fecha === today && !r ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`} style={{ width: "32px", height: "44px" }}>
                        {r ? (
                          <Link href={`/reservas?q=${r.id.slice(0,8)}`} className="block h-full px-1" title={`${r.huespedes?.nombre ?? '—'} · ${formatCurrency(Number(r.importe_total ?? 0))}`}>
                            <div className={`h-full rounded ${startsHere ? "bg-primary text-primary-foreground" : "bg-primary/40"} flex items-center justify-center text-[10px] truncate`}>
                              {startsHere ? (r.huespedes?.nombre?.charAt(0) || "•") : "•"}
                            </div>
                          </Link>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-primary inline-block"></span>Inicio de reserva</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-primary/40 inline-block"></span>Reserva en curso</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-amber-50 border border-amber-200 inline-block"></span>Fin de semana</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-100 border border-emerald-300 inline-block"></span>Hoy</span>
        <span className="italic">Click en una reserva para ver detalle.</span>
      </div>
    </div>
  );
}

function formatRangeLabel(start: Date, end: Date) {
  return `${start.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} → ${new Date(end.getTime() - 86400_000).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
}
