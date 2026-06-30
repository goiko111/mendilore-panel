"use client";

import { useState } from "react";
import { Bed, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type HousekeepingRow = {
  habitacion: string;
  huesped: string;
  fecha_in: string;
  noches_consecutivas: number;
  noches_desde_ultimo_cambio_sabanas: number;
  noches_desde_ultimo_cambio_toallas: number;
};

type Config = {
  cadencia_sabanas: number; // por defecto 4 (ajustado por Juan jun 2026)
  cadencia_toallas: number; // por defecto 2
};

const DEFAULT_CONFIG: Config = { cadencia_sabanas: 4, cadencia_toallas: 2 };

export function HousekeepingBlock({ rows, config = DEFAULT_CONFIG, reservaIdByHabitacion = {} }: { rows: HousekeepingRow[]; config?: Config; reservaIdByHabitacion?: Record<string, string> }) {
  const [marcando, setMarcando] = useState<string | null>(null);

  async function marcar(habitacion: string, tipo: "sabanas" | "toallas") {
    const key = `${habitacion}|${tipo}`;
    setMarcando(key);
    try {
      const res = await fetch("/api/housekeeping/marcar-cambiado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitacion, tipo, reserva_id: reservaIdByHabitacion[habitacion] }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const j = await res.json().catch(() => ({}));
        alert("No se pudo registrar el cambio: " + (j.error ?? res.status));
      }
    } finally {
      setMarcando(null);
    }
  }

  const pendientesSabanas = rows.filter((r) => r.noches_desde_ultimo_cambio_sabanas >= config.cadencia_sabanas);
  const pendientesToallas = rows.filter((r) => r.noches_desde_ultimo_cambio_toallas >= config.cadencia_toallas);
  const totalPendientes = pendientesSabanas.length + pendientesToallas.length;

  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Bed className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">🛏️ Housekeeping (cambios de sábanas y toallas)</h2>
        </div>
        <p className="text-xs text-muted-foreground">Sin habitaciones ocupadas ahora mismo.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Bed className="size-4 text-emerald-700 dark:text-emerald-400" />
          <h2 className="text-base font-semibold text-foreground">🛏️ Housekeeping (cambios de sábanas y toallas)</h2>
        </div>
        {totalPendientes > 0 ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertCircle className="size-3" /> {totalPendientes} {totalPendientes === 1 ? "tarea pendiente" : "tareas pendientes"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="size-3" /> Al día
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Cambio de sábanas cada {config.cadencia_sabanas} noches · Cambio de toallas cada {config.cadencia_toallas} noches · Configurable
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-medium px-3 py-2">Habitación</th>
              <th className="text-left font-medium px-3 py-2">Huésped</th>
              <th className="text-right font-medium px-3 py-2">Noches</th>
              <th className="text-center font-medium px-3 py-2">Sábanas</th>
              <th className="text-center font-medium px-3 py-2">Toallas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const necesitaSabanas = r.noches_desde_ultimo_cambio_sabanas >= config.cadencia_sabanas;
              const necesitaToallas = r.noches_desde_ultimo_cambio_toallas >= config.cadencia_toallas;
              const marcandoSabanas = marcando === `${r.habitacion}|sabanas`;
              const marcandoToallas = marcando === `${r.habitacion}|toallas`;
              return (
                <tr key={r.habitacion} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium text-foreground capitalize">{r.habitacion}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.huesped}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.noches_consecutivas}</td>
                  <td className="px-3 py-2 text-center">
                    {necesitaSabanas ? (
                      <button
                        onClick={() => marcar(r.habitacion, "sabanas")}
                        disabled={marcandoSabanas}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                        title={`Hace ${r.noches_desde_ultimo_cambio_sabanas} noches sin cambiar`}
                      >
                        {marcandoSabanas ? "..." : "Cambiar"}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
                        Al día ({r.noches_desde_ultimo_cambio_sabanas}n)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {necesitaToallas ? (
                      <button
                        onClick={() => marcar(r.habitacion, "toallas")}
                        disabled={marcandoToallas}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                        title={`Hace ${r.noches_desde_ultimo_cambio_toallas} noches sin cambiar`}
                      >
                        {marcandoToallas ? "..." : "Cambiar"}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
                        Al día ({r.noches_desde_ultimo_cambio_toallas}n)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
