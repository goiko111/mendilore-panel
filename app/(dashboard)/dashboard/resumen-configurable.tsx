"use client";

import { useEffect, useState } from "react";
import { Settings2, LogIn, LogOut, Wallet, TrendingUp, Users, Home, Bell, Bed, Clock, BarChart3, AlertCircle, Target, ChevronDown } from "lucide-react";

type KPIKey =
  | "checkins_hoy" | "checkouts_hoy" | "huespedes_presentes" | "llegadas_manana"
  | "cobros_7d" | "habitaciones_libres" | "proxima_llegada" | "tareas_pendientes"
  | "ingresos_mes" | "ingresos_vs_target" | "pipeline_30d" | "pace_7d" | "cobros_pendientes_total"
  | "reservas_nuevas_hoy";

const KPI_DEFS: Record<KPIKey, { label: string; emoji: string; group: string }> = {
  checkins_hoy: { label: "Check-ins hoy", emoji: "🛬", group: "Operacional" },
  checkouts_hoy: { label: "Check-outs hoy", emoji: "🛫", group: "Operacional" },
  huespedes_presentes: { label: "Huéspedes presentes", emoji: "👥", group: "Operacional" },
  llegadas_manana: { label: "Llegadas mañana", emoji: "📅", group: "Operacional" },
  habitaciones_libres: { label: "Habitaciones libres hoy", emoji: "🛏️", group: "Operacional" },
  proxima_llegada: { label: "Próxima llegada", emoji: "⏭️", group: "Operacional" },
  tareas_pendientes: { label: "Tareas pendientes", emoji: "📋", group: "Operacional" },
  cobros_7d: { label: "Cobros vencen <7d", emoji: "💰", group: "Financiero" },
  ingresos_mes: { label: "Ingresos del mes", emoji: "📈", group: "Financiero" },
  ingresos_vs_target: { label: "Ingresos vs target", emoji: "🎯", group: "Financiero" },
  pipeline_30d: { label: "Pipeline 30 días", emoji: "🔮", group: "Financiero" },
  pace_7d: { label: "Pace booking 7d", emoji: "⚡", group: "Financiero" },
  cobros_pendientes_total: { label: "Cobros pendientes total", emoji: "💵", group: "Financiero" },
  reservas_nuevas_hoy: { label: "Reservas nuevas hoy", emoji: "✨", group: "Operacional" }
};

const DEFAULT_KPIS: KPIKey[] = ["checkins_hoy", "checkouts_hoy", "cobros_7d", "pipeline_30d"];

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function ResumenConfigurable({ data }: { data: Record<string, any> }) {
  const [kpis, setKpis] = useState<KPIKey[]>(DEFAULT_KPIS);
  const [showConfig, setShowConfig] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("resumen_kpis");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((k) => k in KPI_DEFS)) {
          setKpis(parsed as KPIKey[]);
        }
      }
    } catch {}
  }, []);

  function savePreference(idx: number, newKey: KPIKey) {
    const newKpis = [...kpis];
    newKpis[idx] = newKey;
    setKpis(newKpis);
    try { localStorage.setItem("resumen_kpis", JSON.stringify(newKpis)); } catch {}
  }

  function renderKPI(key: KPIKey) {
    const def = KPI_DEFS[key];
    const d = data[key] ?? {};
    switch (key) {
      case "checkins_hoy":
        return (
          <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
            hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas hoy"} />
        );
      case "checkouts_hoy":
        return (
          <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
            hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin salidas hoy"} />
        );
      case "huespedes_presentes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="En la casa ahora" />;
      case "llegadas_manana":
        return (
          <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
            hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas mañana"} />
        );
      case "cobros_7d":
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
          hint={d.target ? `Target: ${fmtEur(d.target)}` : "Sin target configurado"}
          accent={d.value !== null && d.value >= 100 ? "green" : d.value !== null && d.value >= 70 ? "amber" : "default"} />;
      case "pipeline_30d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji}
          hint={d.importe ? `${fmtEur(d.importe)} confirmado` : "Sin reservas futuras"} />;
      case "pace_7d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="Reservas nuevas 7d" />;
      case "cobros_pendientes_total":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} hint="Por cobrar" />;
      case "reservas_nuevas_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} hint="Pickup del día" />;
      default:
        return <KPICard label={def.label} value="—" emoji={def.emoji} />;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">Lo más importante del día — pulsa el icono ⚙ en cada KPI para cambiarlo.</p>
        <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted">
          <Settings2 className="size-3.5" />
          {showConfig ? "Cerrar configuración" : "Personalizar KPIs"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        {kpis.map((kpiKey, idx) => (
          <div key={idx} className="relative group">
            {renderKPI(kpiKey)}
            {showConfig && (
              <div className="absolute top-1 right-1 z-10">
                <KPISelector currentKey={kpiKey} onChange={(newKey) => savePreference(idx, newKey)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {showConfig && (
        <div className="text-[11px] text-muted-foreground italic mt-1">
          Cambios se guardan automáticamente en este navegador.
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
    <div className={`rounded-xl border p-4 ${accentBg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        {emoji && <div className="text-base leading-none">{emoji}</div>}
      </div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>}
    </div>
  );
}

function KPISelector({ currentKey, onChange }: { currentKey: string; onChange: (k: any) => void }) {
  return (
    <select
      value={currentKey}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-card border border-border rounded px-1.5 py-0.5 text-foreground shadow-sm cursor-pointer"
    >
      {Object.entries(KPI_DEFS).map(([key, def]) => (
        <option key={key} value={key}>{def.emoji} {def.label}</option>
      ))}
    </select>
  );
}
