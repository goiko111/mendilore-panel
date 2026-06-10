export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Shield, AlertCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/page-header";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Partes policía" };

export default async function PartesPoliciaPage() {
  const supabase = createAdminClient();

  const today = new Date().toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  // Check-ins recientes que requieren parte
  const { data: checkinsRecientes } = await supabase
    .from("reservas")
    .select("id, fecha_in, habitacion, huespedes(id, nombre, apellidos, dni, pasaporte, nacionalidad, fecha_nacimiento, email)")
    .gte("fecha_in", ayer)
    .lte("fecha_in", today)
    .neq("estado_reserva", "cancelada")
    .order("fecha_in", { ascending: false });

  // Partes ya enviados (últimos 30d)
  const { data: partesEnviados } = await supabase
    .from("partes_policia")
    .select("id, reserva_id, huesped_id, estado, fecha_envio, referencia_ses, creado_en")
    .order("creado_en", { ascending: false })
    .limit(50);

  const reservasConParte = new Set((partesEnviados ?? []).filter(p => p.estado === "enviado").map(p => p.reserva_id));
  const pendientes = (checkinsRecientes ?? []).filter((r: any) => !reservasConParte.has(r.id));
  const completos = (pendientes ?? []).filter((r: any) => {
    const h: any = r.huespedes;
    return h?.dni || h?.pasaporte;
  });
  const incompletos = (pendientes ?? []).filter((r: any) => {
    const h: any = r.huespedes;
    return !h?.dni && !h?.pasaporte;
  });

  return (
    <div>
      <PageHeader
        title="Partes policía"
        description="Cumplimiento RD 933/2021 — envío SES.Hospedajes <24h tras check-in"
      />

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">¿Cómo funciona esta pantalla?</h2>
            <p className="text-xs text-muted-foreground">
              El Real Decreto 933/2021 obliga a comunicar al MIR los datos de los huéspedes que se hospedan vía la plataforma SES.Hospedajes en menos de 24 horas tras el check-in.
              Esta pantalla muestra los check-ins de hoy y ayer agrupados por estado. <strong>La integración automática con SES.Hospedajes está pendiente</strong> — por ahora puedes preparar los datos manualmente desde aquí.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Check-ins hoy + ayer" value={String(checkinsRecientes?.length ?? 0)} hint="Pendientes de parte" />
        <StatCard label="Con datos completos" value={String(completos.length)} hint="DNI o pasaporte registrado" />
        <StatCard label="Incompletos" value={String(incompletos.length)} hint={incompletos.length > 0 ? "Falta DNI o pasaporte" : "Al día"} />
      </div>

      <h2 className="text-base font-semibold text-foreground mb-3 mt-6">📋 Check-ins pendientes de parte</h2>
      {!pendientes || pendientes.length === 0 ? (
        <EmptyState
          title="Sin check-ins pendientes"
          description="No hay entradas hoy ni ayer que requieran enviar parte policía."
          icon={<Shield className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                <th className="text-left font-medium px-5 py-2.5">Habitación</th>
                <th className="text-left font-medium px-5 py-2.5">Check-in</th>
                <th className="text-left font-medium px-5 py-2.5">DNI / Pasaporte</th>
                <th className="text-left font-medium px-5 py-2.5">Nacionalidad</th>
                <th className="text-left font-medium px-5 py-2.5">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendientes.map((r: any) => {
                const h: any = r.huespedes;
                const documento = h?.dni || h?.pasaporte;
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3 text-foreground">{h ? `${h.nombre ?? ""} ${h.apellidos ?? ""}`.trim() : "—"}</td>
                    <td className="px-5 py-3 capitalize">{r.habitacion}</td>
                    <td className="px-5 py-3">{formatDate(r.fecha_in)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{documento ?? <span className="text-red-700 dark:text-red-400">— Falta</span>}</td>
                    <td className="px-5 py-3 text-muted-foreground">{h?.nacionalidad ?? "—"}</td>
                    <td className="px-5 py-3">
                      {documento ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Pendiente envío
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Datos incompletos
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {h && <Link href={`/huespedes/${h.id}`} className="text-xs text-primary hover:underline">Completar →</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {partesEnviados && partesEnviados.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-foreground mb-3 mt-6">✅ Histórico de envíos</h2>
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Fecha envío</th>
                  <th className="text-left font-medium px-5 py-2.5">Estado</th>
                  <th className="text-left font-medium px-5 py-2.5">Referencia SES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {partesEnviados.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">{p.fecha_envio ? new Date(p.fecha_envio).toLocaleString("es-ES") : "—"}</td>
                    <td className="px-5 py-3 capitalize">{p.estado}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.referencia_ses ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
