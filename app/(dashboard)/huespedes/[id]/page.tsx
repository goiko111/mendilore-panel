import { EditarHuesped } from "../editar-huesped";
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Huésped" };

export default async function HuespedDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: huesped } = await supabase
    .from("huespedes")
    .select("id, nombre, apellidos, email, telefono, pais, fuente, fecha_alta, notas, dni, pasaporte, fecha_nacimiento, nacionalidad, notas_privadas")
    .eq("id", id)
    .maybeSingle();

  if (!huesped) notFound();

  const { data: reservas } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, noches, importe_total, importe_moneda, estado_reserva, estado_cobro, canal")
    .eq("huesped_id", id)
    .order("fecha_in", { ascending: false });

  const total = (reservas ?? []).reduce((acc, r) => acc + Number(r.importe_total || 0), 0);
  const noches = (reservas ?? []).reduce((acc, r) => acc + Number(r.noches || 0), 0);
  const cobradas = (reservas ?? []).filter((r) => r.estado_cobro === "cobrado").length;

  return (
    <div>
      <div className="mb-2">
        <Link href="/huespedes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="size-3.5" />
          Volver a Huéspedes
        </Link>
      </div>

      <PageHeader
        title={`${huesped.nombre} ${huesped.apellidos ?? ""}`.trim()}
        description={`Alta ${formatDate(huesped.fecha_alta)} · ${huesped.fuente ?? "—"}`}
      />

      <EditarHuesped huesped={huesped} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Reservas totales" value={String(reservas?.length ?? 0)} hint={`${cobradas} ya cobradas`} />
        <StatCard label="Noches totales" value={String(noches)} hint="Suma de todas las estancias" />
        <StatCard label="Ingresos totales" value={formatCurrency(total)} hint="Sin descuentos" />
        <StatCard label="Ticket medio" value={formatCurrency(reservas?.length ? total / reservas.length : 0)} hint="€ por reserva" />
      </div>

      <section className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-3">Contacto</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="text-foreground">
                {huesped.email ? <a href={`mailto:${huesped.email}`} className="hover:underline">{huesped.email}</a> : "—"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">Teléfono</dt>
              <dd className="text-foreground">
                {huesped.telefono ? <a href={`tel:${huesped.telefono}`} className="hover:underline">{huesped.telefono}</a> : "—"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">País</dt>
              <dd className="text-foreground">{huesped.pais ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-muted-foreground">Fuente / canal</dt>
              <dd className="text-foreground">{huesped.fuente ?? "—"}</dd>
            </div>
          </div>
        </dl>
        {(() => {
          const notas = (huesped.notas ?? "").replace(/\[MisterPlan\]/g, "").trim();
          if (!notas) return null;
          return (
            <div className="mt-4 pt-3 border-t border-border text-sm">
              <div className="text-xs text-muted-foreground mb-1">Notas</div>
              <div className="text-foreground whitespace-pre-line">{notas}</div>
            </div>
          );
        })()}
      </section>

      <section className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Histórico de reservas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{reservas?.length ?? 0} reservas</p>
        </div>
        {!reservas || reservas.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground italic">Este huésped aún no tiene reservas en BD.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Habitación</th>
                  <th className="text-left font-medium px-5 py-2">Entrada</th>
                  <th className="text-left font-medium px-5 py-2">Salida</th>
                  <th className="text-right font-medium px-5 py-2">Noches</th>
                  <th className="text-right font-medium px-5 py-2">Importe</th>
                  <th className="text-left font-medium px-5 py-2">Estado</th>
                  <th className="text-left font-medium px-5 py-2">Canal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reservas.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-5 py-2.5 capitalize">{r.habitacion}</td>
                    <td className="px-5 py-2.5">{formatDate(r.fecha_in)}</td>
                    <td className="px-5 py-2.5">{formatDate(r.fecha_out)}</td>
                    <td className="px-5 py-2.5 text-right">{r.noches}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(r.importe_total, r.importe_moneda)}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {r.estado_reserva} · {r.estado_cobro}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">{r.canal ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
