import { CircleAlert, RefreshCw, AlertCircle } from "lucide-react";

/**
 * Indicador de fiabilidad del dato.
 * Sustituye el "0" engañoso cuando un dato NO se ha podido calcular
 * o está en construcción (sincronización pendiente, migration no aplicada, error).
 *
 * Sugerencia de Juan (jun 2026): tan importante saber cuándo un dato no es fiable
 * como tener el dato bien.
 */
export function DataIndicator({
  status,
  message,
}: {
  status: "loading" | "missing" | "stale" | "error";
  message?: string;
}) {
  const config = {
    loading: { icon: RefreshCw, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", label: "Sincronizando…" },
    missing: { icon: AlertCircle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", label: "Sin datos aún" },
    stale: { icon: CircleAlert, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", label: "Datos desactualizados" },
    error: { icon: CircleAlert, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", label: "Error al calcular" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${config.color} ${config.bg} px-2 py-0.5 rounded text-[10px] font-medium`} title={message}>
      <Icon className={`size-3 ${status === "loading" ? "animate-spin" : ""}`} />
      <span>{config.label}</span>
    </span>
  );
}
