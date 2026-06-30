"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

type SyncStatus = {
  ultima_sync_mrplan: string | null;
  ultima_sync_competencia: string | null;
  alertas: string[];
};

/**
 * Banner discreto al inicio del Resumen que muestra:
 *  - Cuándo fue la última sincronización con MisterPlan (frescura del dato)
 *  - Cuándo fue la última captura de competencia
 *  - Alertas de fiabilidad si las hay
 *
 * Si está todo OK aparece colapsado en una línea verde.
 * Si hay problemas se expande con detalle.
 */
export function SyncStatusBanner() {
  const [data, setData] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/sync-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return null;

  const horasDesde = (iso: string | null): number | null => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  };
  const horasMr = horasDesde(data.ultima_sync_mrplan);
  const horasComp = horasDesde(data.ultima_sync_competencia);
  const mrOK = horasMr !== null && horasMr <= 26;
  const compOK = horasComp !== null && horasComp <= 50;
  const todoOK = mrOK && compOK && data.alertas.length === 0;

  if (todoOK) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400 mb-3">
        <CheckCircle2 className="size-3.5" />
        <span>Sincronización al día · MisterPlan hace {horasMr}h · Competencia hace {horasComp}h</span>
      </div>
    );
  }

  // Si algo va mal, banner ámbar/rojo con detalle
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4 flex items-start gap-2.5 text-xs">
      <AlertCircle className="size-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-amber-900 dark:text-amber-200 mb-1">Estado de la sincronización</div>
        <ul className="text-amber-800 dark:text-amber-300 space-y-0.5">
          {data.ultima_sync_mrplan === null && <li>· MisterPlan no ha sincronizado nunca o el registro se borró. Las reservas pueden no estar al día.</li>}
          {horasMr !== null && horasMr > 26 && <li>· La última sincronización con MisterPlan fue hace {horasMr}h (lo normal son 24h). Puede haber reservas nuevas sin reflejar.</li>}
          {data.ultima_sync_competencia === null && <li>· No hay capturas de competencia recientes.</li>}
          {horasComp !== null && horasComp > 50 && <li>· La última captura de competencia fue hace {horasComp}h.</li>}
          {data.alertas.map((a, i) => <li key={i}>· {a}</li>)}
        </ul>
      </div>
    </div>
  );
}
