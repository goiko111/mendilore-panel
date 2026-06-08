export const runtime = 'edge';

import Link from "next/link";
import { CalendarRange, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Reservas" };

export default async function ReservasPage() {
  const supabase = await createClient();
  const { data: reservas } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, noches, importe_total, importe_moneda, estado_reserva, estado_cobro, canal, huespedes(nombre, apellidos)")
    .order("fecha_in", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Reservas"
        description={`${reservas?.length ?? 0} reservas cargadas`}
        actions={
          <Link
            href="/api/export/reservas"
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 px-3 py-1.5 rounded-md transition"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </Link>
        }
      />

      {!reservas || reservas.length === 0 ? (
        <EmptyState
          title="No hay reservas todavía"
          description="La sincronización con MisterPlan se activa cuando confirmemos la vía de integración (API, iCal o CSV). Mientras tanto puedes importar reservas manualmente."
          icon={<CalendarRange className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                <th className="text-left font-medium px-5 py-2.5">Habitación</th>
                <th className="text-left font-medium px-5 py-2.5">Entrada</th>
                <th className="text-left font-medium px-5 py-2.5">Salida</th>
                <th className="text-right font-medium px-5 py-2.5">Noches</th>
                <th className="text-right font-medium px-5 py-2.5">Importe</th>
                <th className="text-left font-medium px-5 py-2.5">Reserva</th>
                <th className="text-left font-medium px-5 py-2.5">Cobro</th>
                <th className="text-left font-medium px-5 py-2.5">Canal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservas.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-foreground">
                    {r.huespedes ? `${r.huespedes.nombre ?? ""} ${r.huespedes.apellidos ?? ""}`.trim() : "—"}
                  </td>
                  <td className="px-5 py-3 capitalize">{r.habitacion}</td>
                  <td className="px-5 py-3">{formatDate(r.fecha_in)}</td>
                  <td className="px-5 py-3">{formatDate(r.fecha_out)}</td>
                  <td className="px-5 py-3 text-right">{r.noches}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.importe_total, r.importe_moneda)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.estado_reserva}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.estado_cobro}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.canal ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
