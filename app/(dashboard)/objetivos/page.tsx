export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";
import { GuardarObjetivo } from "./objetivos-client";

export const metadata = { title: "Objetivos mensuales" };

export default async function ObjetivosPage() {
  const supabase = await createClient();
  const { data: objetivos } = await supabase
    .from("objetivos_mensuales")
    .select("year, month, ingresos_target, ocupacion_target_pct, noches_target, notas")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  // Próximos 6 meses para que ponga objetivos
  const proximos: { year: number; month: number; label: string; existente: any }[] = [];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const existente = objetivos?.find(o => o.year === y && o.month === m);
    proximos.push({
      year: y,
      month: m,
      label: d.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
      existente
    });
  }

  return (
    <div>
      <PageHeader title="Objetivos mensuales" description="Define ingresos, ocupación y noches objetivo cada mes" />

      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">📊 Cómo funcionan los objetivos</h2>
        <p className="text-xs text-muted-foreground">
          Define un target mensual de ingresos · ocupación · noches. El panel mostrará el % de cumplimiento en el Resumen ("Ingresos vs target") y en alertas semanales. Sirve para Anabel para saber cómo van vs el plan.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {proximos.map((p) => (
          <div key={`${p.year}-${p.month}`} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="size-4 text-primary" />
              <div className="font-medium text-foreground capitalize">{p.label}</div>
            </div>
            <GuardarObjetivo
              year={p.year}
              month={p.month}
              existente={p.existente ? {
                ingresos_target: Number(p.existente.ingresos_target ?? 0),
                ocupacion_target_pct: Number(p.existente.ocupacion_target_pct ?? 0),
                noches_target: Number(p.existente.noches_target ?? 0),
                notas: p.existente.notas ?? ""
              } : null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
