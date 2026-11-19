"use client";

import { useEffect, useState } from "react";
import { Settings2, Eye, EyeOff } from "lucide-react";
import { KPITooltip } from "@/components/kpi-tooltip";

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
      mide: "Habitaciones con entrada hoy. Una reserva de dos habitaciones cuenta dos.",
      calculo: "Reservas con fecha de entrada hoy en las 6 habitaciones, sin anuladas ni no-show.",
      origen: "MisterPlan (sincronización cada 2 h)",
      sistemas: "MrPlan → robot de sincronización → BD del panel"
    }
  },
  checkouts_hoy: {
    label: "Check-outs hoy", emoji: "🛫", group: "Operacional",
    tooltip: {
      mide: "Habitaciones con salida hoy. Una reserva de dos habitaciones cuenta dos.",
      calculo: "Reservas con fecha de salida hoy en las 6 habitaciones, sin anuladas ni no-show.",
      origen: "MisterPlan (sincronización cada 2 h)",
      sistemas: "MrPlan → robot de sincronización → BD del panel"
    }
  },
  huespedes_presentes: {
    label: "Personas alojadas ahora", emoji: "👥", group: "Operacional",
    tooltip: {
      mide: "Número total de personas alojadas en este momento.",
      calculo: "Suma de huéspedes de las habitaciones ocupadas esta noche (entrada hasta hoy y salida después de hoy). Si MisterPlan no da el número, cuenta 2 por habitación.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel (suma por reserva activa)"
    }
  },
  llegadas_manana: {
    label: "Llegadas mañana", emoji: "📅", group: "Operacional",
    tooltip: {
      mide: "Habitaciones con entrada mañana.",
      calculo: "Reservas con fecha de entrada mañana en las 6 habitaciones, sin anuladas ni no-show.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  habitaciones_libres: {
    label: "Habitaciones ocupadas hoy", emoji: "🛏️", group: "Operacional",
    tooltip: {
      mide: "Habitaciones ocupadas esta noche, de las 6. Debajo, las que quedan libres.",
      calculo: "Habitaciones con una estancia que incluye la noche de hoy (entrada hasta hoy y salida después de hoy), sin anuladas ni no-show.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  proxima_llegada: {
    label: "Próxima llegada", emoji: "⏭️", group: "Operacional",
    tooltip: {
      mide: "Fecha y huésped de la siguiente reserva con entrada posterior a hoy.",
      calculo: "La primera entrada posterior a hoy en las 6 habitaciones, sin anuladas ni no-show.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  tareas_pendientes: {
    label: "Tareas pendientes", emoji: "📋", group: "Operacional",
    tooltip: {
      mide: "Tareas internas marcadas como pendientes (módulo Tareas).",
      calculo: "Tareas sin completar, tengan o no fecha límite.",
      origen: "Panel propio (módulo Tareas)",
      sistemas: "BD del panel"
    }
  },
  reservas_nuevas_hoy: {
    label: "Reservas nuevas hoy", emoji: "✨", group: "Operacional",
    tooltip: {
      mide: "Reservas hechas hoy, sea cual sea su fecha de entrada.",
      calculo: "Reservas con fecha de reserva de hoy en MisterPlan, sin anuladas. Una reserva de varias habitaciones cuenta una.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobros_14d: {
    label: "Cobros próximos a vencer (14d)", emoji: "💰", group: "Cobros",
    tooltip: {
      mide: "Reservas que entran en los próximos 14 días, siguen sin cobrar y dependen de vosotros. Debajo, lo que suman.",
      calculo: "Estado de cobro «pendiente» y entrada entre hoy y dentro de 14 días. No incluye las de Booking (las cobra Booking Payments) ni las de web o teléfono con anticipo cobrado (el resto se paga a la salida). Una fila por habitación, como la lista de abajo.",
      origen: "MisterPlan (estado de cobro por reserva)",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobros_pendientes_total: {
    label: "Pendiente de cobro total", emoji: "💵", group: "Cobros",
    tooltip: {
      mide: "Lo que suman todas las reservas que siguen sin cobrar y dependen de vosotros, entren cuando entren.",
      calculo: "Importe total de las reservas con estado de cobro «pendiente» y salida desde hoy. Mismas exclusiones que los cobros a 14 días: sin Booking y sin las de web o teléfono con anticipo cobrado.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  cobrado_mes: {
    label: "Cobrado este mes", emoji: "✅", group: "Cobros",
    tooltip: {
      mide: "De las reservas que han entrado este mes (del día 1 a hoy), el importe que MisterPlan marca como cobrado. Debajo, lo que suman esas mismas reservas. No se compara con «Ingresos del mes», que reparte cada estancia por noches.",
      calculo: "SUM(importe_total) WHERE estado_cobro = 'cobrado' AND fecha_in entre el día 1 y hoy (sin canceladas)",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  tasa_cobro: {
    label: "Tasa de cobro %", emoji: "📊", group: "Cobros",
    tooltip: {
      mide: "De las reservas que han entrado este mes (del día 1 a hoy), cuántas están cobradas. Las de Booking Payments cuentan como cobradas: ya están pagadas a Booking.",
      calculo: "(reservas cobradas ÷ reservas con fecha_in entre el día 1 y hoy, sin canceladas) × 100",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel → cálculo derivado"
    }
  },
  ingresos_mes: {
    label: "Ingresos del mes", emoji: "📈", group: "Financiero",
    tooltip: {
      mide: "Producción del mes hasta hoy: alojamiento y consumos de las noches del día 1 a hoy, con cada estancia repartida entre sus noches. Es la misma cifra que Métricas con «Mes actual».",
      calculo: "SUM(ingresos del día) de produccion_dia entre el día 1 y hoy",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  ingresos_vs_target: {
    label: "Ingresos vs año anterior", emoji: "📈", group: "Financiero",
    tooltip: {
      mide: "Ingresos del mes hasta hoy comparados con las mismas fechas del año anterior.",
      calculo: "(ingresos del día 1 a hoy ÷ ingresos de las mismas fechas hace un año − 1) × 100. Alojamiento y consumos, con cada estancia repartida entre sus noches, como «Ingresos del mes».",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel → cálculo derivado"
    }
  },
  pipeline_30d: {
    label: "Cartera próximos 30 días", emoji: "🔮", group: "Financiero",
    tooltip: {
      mide: "Habitaciones reservadas con entrada en los próximos 30 días. Debajo, lo que suman.",
      calculo: "Reservas con entrada entre hoy y dentro de 30 días en las 6 habitaciones, sin anuladas ni no-show. Una fila por habitación. Importe total, con consumos.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  },
  pace_7d: {
    label: "Ritmo de reservas 7d", emoji: "⚡", group: "Financiero",
    tooltip: {
      mide: "Reservas hechas en los últimos 7 días para fechas futuras.",
      calculo: "Reservas con fecha de reserva en MisterPlan de los últimos 7 días y entrada posterior a hoy, sin anuladas. Una reserva de varias habitaciones cuenta una.",
      origen: "MisterPlan",
      sistemas: "MrPlan → robot → BD del panel"
    }
  }
};

const DEFAULT_VISIBLES: KPIKey[] = ["checkins_hoy", "checkouts_hoy", "habitaciones_libres", "cobros_14d", "cobrado_mes", "ingresos_mes", "pipeline_30d"];

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
        return <KPICard label={def.label} value={`${d.value ?? 0} / ${d.total ?? 6}`} emoji={def.emoji} tooltip={def.tooltip} hint={d.hint ?? "Disponibles hoy"} />;
      case "proxima_llegada":
        return <KPICard label={def.label} value={String(d.value ?? "—")} emoji={def.emoji} tooltip={def.tooltip} hint={d.detail || "Sin reservas futuras"} />;
      case "tareas_pendientes":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.value > 0 ? "Sin completar" : "Sin pendientes"} accent={d.value > 0 ? "amber" : "default"} />;
      case "ingresos_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Acumulado mes" />;
      case "ingresos_vs_target":
        return <KPICard label={def.label}
          value={d.value !== null && d.value !== undefined ? `${d.value >= 0 ? "+" : ""}${d.value.toFixed(0)}%` : "—"}
          emoji={def.emoji} tooltip={def.tooltip}
          hint={d.anterior ? `frente a ${fmtEur(d.anterior)} hace un año` : "Sin datos del año anterior"}
          accent={d.value !== null && d.value !== undefined && d.value >= 0 ? "green" : "default"} />;
      case "pipeline_30d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip}
          hint={d.importe ? `${fmtEur(d.importe)} en cartera` : "Sin reservas futuras"} />;
      case "pace_7d":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Reservas nuevas 7d" />;
      case "cobros_pendientes_total":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Por cobrar" accent={d.value > 0 ? "amber" : "default"} />;
      case "reservas_nuevas_hoy":
        return <KPICard label={def.label} value={String(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint="Pickup del día" />;
      case "cobrado_mes":
        return <KPICard label={def.label} value={fmtEur(d.value ?? 0)} emoji={def.emoji} tooltip={def.tooltip} hint={`de ${fmtEur(d.base ?? 0)} de esas reservas`} accent="green" />;
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
            Los cambios se guardan automáticamente en este navegador: en otro ordenador o en el móvil se eligen aparte.
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
