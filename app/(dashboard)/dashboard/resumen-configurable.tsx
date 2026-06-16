"use client";

import { useEffect, useState } from "react";
import { Settings2, Eye, EyeOff } from "lucide-react";

type KPIKey =
  | "checkins_hoy" | "checkouts_hoy" | "huespedes_presentes" | "llegadas_manana"
  | "cobros_14d" | "habitaciones_libres" | "proxima_llegada" | "tareas_pendientes"
  | "ingresos_mes" | "ingresos_vs_target" | "pipeline_30d" | "pace_7d" | "cobros_pendientes_total"
  | "reservas_nuevas_hoy" | "cobrado_mes" | "tasa_cobro";

const KPI_DEFS: Record<KPIKey, { label: string; emoji: string; group: string }> = {
  checkins_hoy: { label: "Check-ins hoy", emoji: "🛬", group: "Operacional" },
  checkouts_hoy: { label: "Check-outs hoy", emoji: "🛫", group: "Operacional" },
  huespedes_presentes: { label: "Personas alojadas ahora", emoji: "👥", group: "Operacional" },
  llegadas_manana: { label: "Llegadas mañana", emoji: "📅", group: "Operacional" },
  habitaciones_libres: { label: "Habitaciones ocupadas hoy", emoji: "🛏️", group: "Operacional" },
  proxima_llegada: { label: "Próxima llegada", emoji: "⏭️", group: "Operacional" },
  tareas_pendientes: { label: "Tareas pendientes", emoji: "📋", group: "Operacional" },
  reservas_nuevas_hoy: { label: "Reservas nuevas hoy", emoji: "✨", group: "Operacional" },
  cobros_14d: { label: "Cobros próximos a vencer (14d)", emoji: "💰", group: "Cobros" },
  cobros_pendientes_total: { label: "Pendiente de cobro total", emoji: "💵", group: "Cobros" },
  cobrado_mes: { label: "Cobrado este mes", emoji: "✅", group: "Cobros" },
  tasa_cobro: { label: "Tasa de cobro %", emoji: "📊", group: "Cobros" },
  ingresos_mes: { label: "Ingresos del mes", emoji: "📈", group: "Financiero" },
  ingresos_vs_target: { label: "Ingresos vs año anterior", emoji: "📈", group: "Financiero" },
  pipeline_30d: { label: "Cartera próximos 30 días", emoji: "🔮", group: "Financiero" },
  pace_7d: { label: "Ritmo de reservas 7d", emoji: "⚡", group: "Financiero" }
};

const DEFAULT_VISIBLES: KPIKey[] = ["checkins_hoy", "checkouts_hoy", "cobros_14d", "pipeline_30d", "cobrado_mes", "habitaciones_libres", "ingresos_mes", "pipeline_30d"];

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function ResumenConfigurable({ data }: { data: Record<string, any> }) {
  const [visibles, setVisibles] = useState<Set<KPIKey>>(new Set(DEFAULT_VISIBLES));
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("resumen_kpis_visibles");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) setVisibles(new Set(arr.filter((k) => k in KPI_DEFS)));
      }
    } catch {}
  }, []);

  function toggleVisible(k: KPIKey) {
    const newSet = new Set(visibles);
    if (newSet.has(k)) newSet.delete(k); else newSet.add(k);
    setVisibles(newSet);
    try { localStorage.setItem("resumen_kpis_visibles", JSON.stringify([...newSet])); } catch {}
  }

  function renderKPI(key: KPIKey) {
    const def = KPI_DEFS[key];
    const d = data[key] ?? {};
    switch (key) {
      case "checkins_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas hoy"} />;
      case "checkouts_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin salidas hoy"} />;
      case "huespedes_presentes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="En la casa ahora" />;
      case "llegadas_manana":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas mañana"} />;
      case "cobros_14d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.importe ? fmtEur(d.importe) : "Sin pendientes"} accent={d.value > 0 ? "amber" : "default"} />;
      case "habitaciones_libres":
        return <KPICard label={def.label} value={`${d.value ?? 0} / ${d.total ?? 6}`} emoji={def.emoji} hint="Disponibles hoy" />;
      case "proxima_llegada":
        return <KPICard label={def.label} value={String(d.value ?? "—")} emoji={def.emoji} hint={d.detail || "Sin reservas futuras"} />;
      case "tareas_pendientes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.value > 0 ? "Ver /tareas" : "Sin pendientes"} accent={d.value > 0 ? "amber" : "default"} />;
      case "ingresos_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} hint="Acumulado mes" />;
      case "ingresos_vs_target":
        return <KPICard label={def.label}
          value={d.value !== null && d.value !== undefined ? `${d.value.toFixed(0)}%` : "—"}
          emoji={def.emoji}
          hint={d.target ? `Target: ${fmtEur(d.target)}` : "Define en /objetivos"}
          accent={d.value !== null && d.value >= 100 ? "green" : d.value !== null && d.value >= 70 ? "amber" : "default"} />;
      case "pipeline_30d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.importe ? `${fmtEur(d.importe)} confirmado` : "Sin reservas futuras"} />;
      case "pace_7d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="Reservas nuevas 7d" />;
      case "cobros_pendientes_total":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} hint="Por cobrar" accent={d.value > 0 ? "amber" : "default"} />;
      case "reservas_nuevas_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="Pickup del día" />;
      case "cobrado_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} hint="Confirmado cobrado" accent="green" />;
      case "tasa_cobro":
        return <KPICard label={def.label} value={d.value !== null && d.value !== undefined ? `${d.value.toFixed(0)}%` : "—"} emoji={def.emoji} hint={`${d.cobradas ?? 0} / ${d.total ?? 0} reservas`} accent={d.value >= 80 ? "green" : d.value >= 50 ? "amber" : "default"} />;
    }
  }

  // Agrupar KPIs por grupo
  const grupos: Record<string, KPIKey[]> = {};
  (Object.keys(KPI_DEFS) as KPIKey[]).forEach((k) => {
    const g = KPI_DEFS[k].group;
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(k);
  });

  const kpisVisibles = (Object.keys(KPI_DEFS) as KPIKey[]).filter((k) => visibles.has(k));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{kpisVisibles.length} KPIs visibles. Personaliza cuáles ver con el botón →</p>
        <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border hover:bg-muted">
          <Settings2 className="size-3.5" />
          {showConfig ? "Cerrar personalización" : "Personalizar KPIs"}
        </button>
      </div>

      {showConfig && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Elige qué KPIs quieres ver en el Resumen</h3>
          {Object.entries(grupos).map(([grupo, keys]) => (
            <div key={grupo} className="mb-4 last:mb-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">{grupo}</div>
              <div className="flex flex-wrap gap-2">
                {keys.map((k) => {
                  const active = visibles.has(k);
                  return (
                    <button
                      key={k}
                      onClick={() => toggleVisible(k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {active ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                      <span>{KPI_DEFS[k].emoji}</span>
                      <span>{KPI_DEFS[k].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground italic mt-3">
            Cambios se guardan automáticamente en este navegador. Cada usuario tiene su propia configuración.
          </p>
        </div>
      )}

      {kpisVisibles.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">No tienes KPIs visibles. Pulsa "Personalizar KPIs" para añadir alguno.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpisVisibles.map((kpiKey) => (
            <div key={kpiKey}>{renderKPI(kpiKey)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, hint, emoji, accent = "default" }: { label: string; value: string; hint?: string; emoji?: string; accent?: "default" | "amber" | "green" }) {
  const accentBg = accent === "amber" ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
    : accent === "green" ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10"
    : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${accentBg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        {emoji && <div className="text-base leading-none">{emoji}</div>}
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>}
    </div>
  );
}
