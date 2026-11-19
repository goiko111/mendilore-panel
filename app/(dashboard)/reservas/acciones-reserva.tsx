"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";

// Antes había también un botón "Marcar cobrado". Lo quitamos: el estado de
// cobro manda en MisterPlan, el botón solo cambiaba la fila del panel y la
// siguiente sincronización lo volvía a pisar. Los cobros se registran en
// MisterPlan y el panel los recoge solo.
export function AccionesReserva({
  id,
  huesped_email,
  firmada,
  mostrarLegal = true,
}: {
  id: string;
  estado_cobro?: string;
  huesped_email?: string | null;
  firmada?: boolean;
  /** false en las demás habitaciones de una reserva: la firma es una por reserva. */
  mostrarLegal?: boolean;
}) {
  const [loadingLegal, setLoadingLegal] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviarLegal() {
    if (!huesped_email) { setError("Sin email"); return; }
    const pregunta = firmada
      ? `Esta reserva ya tiene las condiciones firmadas. ¿Reenviar el enlace a ${huesped_email}?`
      : `¿Enviar el enlace de condiciones a ${huesped_email}?`;
    if (!confirm(pregunta)) return;
    setLoadingLegal(true);
    setError(null);
    const r = await fetch("/api/reservas/enviar-legal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reserva_id: id })
    });
    setLoadingLegal(false);
    if (r.ok) {
      setEnviado(true);
      setTimeout(() => setEnviado(false), 3000);
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Error al enviar");
    }
  }

  if (!mostrarLegal) return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={enviarLegal}
        disabled={loadingLegal || !huesped_email}
        className={`inline-flex items-center justify-center size-7 rounded transition border border-border text-muted-foreground hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 ${enviado ? "bg-blue-100 text-blue-700" : ""}`}
        title={huesped_email ? `Enviar enlace de condiciones a ${huesped_email}` : "El huésped no tiene email en MisterPlan"}
      >
        {loadingLegal ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
      </button>
      {error && <span className="text-[10px] text-red-700 dark:text-red-400">{error}</span>}
      {enviado && <span className="text-[10px] text-emerald-700 dark:text-emerald-400">✓ Enviado</span>}
    </div>
  );
}
