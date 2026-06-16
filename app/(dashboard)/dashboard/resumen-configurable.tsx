"use client";

import { useEffect, useState } from "react";
import { Settings2, Eye, EyeOff } from "lucide-react";

type KPIKey =
  | "checkins_hoy" | "checkouts_hoy" | "huespedes_presentes" | "llegadas_manana"
  | "cobros_14d" | "habitaciones_libres" | "proxima_llegada" | "tareas_pendientes"
  | "ingresos_mes" | "ingresos_vs_target" | "pipeline_30d" | "pace_7d" | "cobros_pendientes_total"
  | "reservas_nuevas_hoy" | "cobrado_mes" | "tasa_cobro";

type KPIDef = {
  label: string;
  emoji: string;
  group: string;
  tooltip?: { mide: string; calculo: string; origen: string; sistemas: string };
};

const KPI_DEFS: Record<KPIKey, KPIDef> = {
  checkins_hoy: {
    label: "Check-ins hoy", emoji: "🛬", group: "Operacional",
    tooltip: {
      mide: "Número de huéspedes que entran hoy a Casa Mendilore.",
      calculo: "COUNT(reservas) WHERE fecha_in = hoy AND estado_cobro ≠ cancelado",
      origen: "MisterPlan (sincronización cada 2 h)",
      sistemas: "MrPlan → robot de sincronización → BD del panel"
    }
  },
  checkouts_hoy: {
    label: "Check-outs hoy", emoji: "🛫", group: "Operacional",
    tooltip: {
      mide: "Número de huéspedes que salen hoy de Casa Mendilore.",
      calculo: "COUNT(reservas) WHERE fecha_out = hoy AND estado_cobro ≠ cancelado",
      origen: "MisterPlan (sincronización cada 2 h)",
      sistemas: "MrPlan → robot de sincronización → BD del panel"
    }
  },
  huespedes_presentes: {
    label: "Personas alojadas ahora", emoji: "👥", group: "Operacional",
    tooltip: {
      mide: "Número total de personas alojadas en este momento.",
      calculo: "SUM(numero_huespedes) WHERE fecha_in ≤ hoy AND fecha_out > hoy",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel (suma por reserva activa)"
    }
  },
  llegadas_manana: {
    label: "Llegadas mañana", emoji: "📅", group: "Operacional",
    tooltip: {
      mide: "Reservas con entrada prevista mañana.",
      calculo: "COUNT(reservas) WHERE fecha_in = mañana AND estado_cobro ≠ cancelado",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  habitaciones_libres: {
    label: "Habitaciones ocupadas hoy", emoji: "🛏️", group: "Operacional",
    tooltip: {
      mide: "Habitaciones ocupadas en este momento (subtítulo: libres restantes).",
      calculo: "COUNT(reservas activas) sobre las 6 habitaciones totales",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  proxima_llegada: {
    label: "Próxima llegada", emoji: "⏭️", group: "Operacional",
    tooltip: {
      mide: "Fecha y huésped de la siguiente reserva con entrada posterior a hoy.",
      calculo: "MIN(fecha_in) WHERE fecha_in > hoy",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  tareas_pendientes: {
    label: "Tareas pendientes", emoji: "📋", group: "Operacional",
    tooltip: {
      mide: "Tareas internas marcadas como pendientes (módulo Tareas).",
      calculo: "COUNT(tareas) WHERE estado = 'pendiente'",
      origen: "Panel propio (módulo Tareas)",
      sistemas: "BD del panel"
    }
  },
  reservas_nuevas_hoy: {
    label: "Reservas nuevas hoy", emoji: "✨", group: "Operacional",
    tooltip: {
      mide: "Reservas creadas hoy (independientemente de la fecha de check-in).",
      calculo: "COUNT(reservas) WHERE creada_en = hoy",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobros_14d: {
    label: "Cobros próximos a vencer (14d)", emoji: "💰", group: "Cobros",
    tooltip: {
      mide: "Reservas con entrada en los próximos 14 días que aún están sin cobrar.",
      calculo: "COUNT(reservas) WHERE estado_cobro = 'pendiente' AND fecha_in ∈ [hoy, hoy+14d]",
      origen: "MisterPlan (estado de cobro por reserva)",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobros_pendientes_total: {
    label: "Pendiente de cobro total", emoji: "💵", group: "Cobros",
    tooltip: {
      mide: "Importe total acumulado de todas las reservas pendientes de cobro.",
      calculo: "SUM(importe_total) WHERE estado_cobro = 'pendiente'",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobrado_mes: {
    label: "Cobrado este mes", emoji: "✅", group: "Cobros",
    tooltip: {
      mide: "Importe ya cobrado de las reservas con check-in en el mes en curso.",
      calculo: "SUM(importe_total) WHERE estado_cobro = 'cobrado' AND fecha_in en mes actual",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  tasa_cobro: {
    label: "Tasa de cobro %", emoji: "📊", group: "Cobros",
    tooltip: {
      mide: "Porcentaje de los ingresos del mes en curso que ya están cobrados.",
      calculo: "(cobrado este mes ÷ ingresos del mes) × 100",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel → cálculo derivado"
    }
  },
  ingresos_mes: {
    label: "Ingresos del mes", emoji: "📈", group: "Financiero",
    tooltip: {
      mide: "Importe total facturado por reservas con check-in en el mes en curso.",
      calculo: "SUM(importe_total) WHERE fecha_in en mes actual",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  ingresos_vs_target: {
    label: "Ingresos vs año anterior", emoji: "📈", group: "Financiero",
    tooltip: {
      mide: "Comparación de los ingresos del mes con el mismo mes del año anterior.",
      calculo: "((ingresos mes actual ÷ ingresos mismo mes año anterior) − 1) × 100",
      origen: "MisterPlan (requiere histórico de 12+ meses)",
      sistemas: "MrPlan → robot → BD del panel → cálculo derivado"
    }
  },
  pipeline_30d: {
    label: "Cartera próximos 30 días", emoji: "🔮", group: "Financiero",
    tooltip: {
      mide: "Reservas confirmadas con entrada prevista en los próximos 30 días.",
      calculo: "COUNT(reservas) WHERE estado_reserva = confirmada AND fecha_in ∈ [hoy, hoy+30d]",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  pace_7d: {
    label: "Ritmo de reservas 7d", emoji: "⚡", group: "Financiero",
    tooltip: {
      mide: "Reservas creadas en los últimos 7 días para fechas futuras.",
      calculo: "COUNT(reservas) WHERE creada_en ∈ [hoy-7d, hoy] AND fecha_in > hoy",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  }
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
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas hoy"} />;
      case "checkouts_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin salidas hoy"} />;
      case "huespedes_presentes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="En la casa ahora" />;
      case "llegadas_manana":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.detail?.length > 0 ? d.detail.slice(0, 2).join(" · ") : "Sin llegadas mañana"} />;
      case "cobros_14d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.importe ? fmtEur(d.importe) : "Sin pendientes"} accent={d.value > 0 ? "amber" : "default"} />;
      case "habitaciones_libres":
        return <KPICard label={def.label} value={`${d.value ?? 0} / ${d.total ?? 6}`} emoji={def.emoji} tooltip={def.tooltip} hint="Disponibles hoy" />;
      case "proxima_llegada":
        return <KPICard label={def.label} value={String(d.value ?? "—")} emoji={def.emoji} tooltip={def.tooltip} hint={d.detail || "Sin reservas futuras"} />;
      case "tareas_pendientes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.value > 0 ? "Ver /tareas" : "Sin pendientes"} accent={d.value > 0 ? "amber" : "default"} />;
      case "ingresos_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Acumulado mes" />;
      case "ingresos_vs_target":
        return <KPICard label={def.label}
          value={d.value !== null && d.value !== undefined ? `${d.value.toFixed(0)}%` : "—"}
          emoji={def.emoji} tooltip={def.tooltip}
          hint={d.target ? `Target: ${fmtEur(d.target)}` : "Define en /objetivos"}
          accent={d.value !== null && d.value >= 100 ? "green" : d.value !== null && d.value >= 70 ? "amber" : "default"} />;
      case "pipeline_30d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.importe ? `${fmtEur(d.importe)} confirmado` : "Sin reservas futuras"} />;
      case "pace_7d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Reservas nuevas 7d" />;
      case "cobros_pendientes_total":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Por cobrar" accent={d.value > 0 ? "amber" : "default"} />;
      case "reservas_nuevas_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Pickup del día" />;
      case "cobrado_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Confirmado cobrado" accent="green" />;
      case "tasa_cobro":
        return <KPICard label={def.label} value={d.value !== null && d.value !== undefined ? `${d.value.toFixed(0)}%` : "—"} emoji={def.emoji} tooltip={def.tooltip} hint={`${d.cobradas ?? 0} / ${d.total ?? 0} reservas`} accent={d.value >= 80 ? "green" : d.value >= 50 ? "amber" : "default"} />;
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

function KPICard({ label, value, hint, emoji, accent = "default", tooltip }: { label: string; value: string; hint?: string; emoji?: string; accent?: "default" | "amber" | "green"; tooltip?: { mide: string; calculo: string; origen: string; sistemas: string } }) {
  const accentBg = accent === "amber" ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
    : accent === "green" ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10"
    : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${accentBg}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center">{label}{tooltip ? <KPITooltip {...tooltip} /> : null}</div>
        {emoji && <div className="text-base leading-none">{emoji}</div>}
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>}
    </div>
  );
}
