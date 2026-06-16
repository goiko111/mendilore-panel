"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bell, ChevronRight, CheckCircle2 } from "lucide-react";

type Alerta = {
  tipo: "cobro" | "sabanas" | "legal" | "competencia" | "scraper";
  severidad: "info" | "warning" | "critica";
  titulo: string;
  detalle: string;
  href?: string;
};

const colorBySeveridad: Record<string, string> = {
  info: "bg-blue-50 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 text-blue-900 dark:text-blue-200",
  warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40 text-amber-900 dark:text-amber-200",
  critica: "bg-red-50 dark:bg-red-950/30 border-red-300/60 dark:border-red-800/40 text-red-900 dark:text-red-200"
};

export function AlertasInlineBlock() {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/alertas-inline", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAlertas(j.alertas ?? []))
      .catch(() => setAlertas([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!alertas) return null;

  if (alertas.length === 0) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-lg p-3 mb-4 flex items-center gap-2">
        <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-900 dark:text-emerald-200">Todo al día. No hay alertas operativas pendientes.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 mb-4">
      {alertas.map((a, i) => (
        <Link
          key={i}
          href={a.href ?? "#"}
          className={`block border rounded-lg p-3 transition hover:opacity-90 ${colorBySeveridad[a.severidad] ?? colorBySeveridad.info}`}
        >
          <div className="flex items-start gap-2">
            {a.severidad === "critica" ? <AlertCircle className="size-4 shrink-0 mt-0.5" /> : <Bell className="size-4 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">{a.titulo}</div>
              <div className="text-xs opacity-90 mt-0.5 leading-snug">{a.detalle}</div>
            </div>
            {a.href && <ChevronRight className="size-4 shrink-0 opacity-60" />}
          </div>
        </Link>
      ))}
    </div>
  );
}
