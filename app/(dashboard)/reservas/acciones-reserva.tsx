"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, Loader2 } from "lucide-react";

export function AccionesReserva({
  id,
  estado_cobro,
  huesped_email,
  firmada,
}: {
  id: string;
  estado_cobro: string;
  huesped_email?: string | null;
  firmada?: boolean;
}) {
  const router = useRouter();
  const [loadingCobrar, setLoadingCobrar] = useState(false);
  const [loadingLegal, setLoadingLegal] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarCobrado() {
    if (estado_cobro === "cobrado") return;
    // Bloqueo blando: si no hay firma, pedir confirmación con warning explícito
    if (!firmada) {
      const ok = confirm(
        "⚠ ATENCIÓN — Esta reserva no tiene aceptación de condiciones registrada.\n\n" +
        "Si la marcas como cobrada sin firma:\n" +
        "  · perderás la trazabilidad jurídica frente a una reclamación,\n" +
        "  · no podrás demostrar que el huésped aceptó las condiciones particulares (política de cancelación, mascotas, etc.).\n\n" +
        "Recomendado: cancela esta acción, pulsa primero el botón sobre azul (✉) para enviar el enlace legal, espera a que firme y luego cobra.\n\n" +
        "¿Aun así quieres marcarla como cobrada SIN firma?"
      );
      if (!ok) return;
    }
    setLoadingCobrar(true);
    setError(null);
    const r = await fetch("/api/reservas/cobrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado: "cobrado" })
    });
    setLoadingCobrar(false);
    if (r.ok) router.refresh();
    else setError("Error al marcar");
  }

  async function enviarLegal() {
    if (!huesped_email) { setError("Sin email"); return; }
    if (!confirm(`¿Enviar enlace legal a ${huesped_email}?`)) return;
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
      const d = await r.json();
      setError(d.error || "Error al enviar");
    }
  }

  const cobrarNeedsWarning = estado_cobro !== "cobrado" && !firmada;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={marcarCobrado}
        disabled={loadingCobrar || estado_cobro === "cobrado"}
        className={`relative inline-flex items-center justify-center size-7 rounded transition ${
          estado_cobro === "cobrado"
            ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
            : cobrarNeedsWarning
              ? "border border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              : "border border-border text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
        }`}
        title={
          estado_cobro === "cobrado"
            ? "Ya cobrado"
            : cobrarNeedsWarning
              ? "⚠ Marcar cobrado SIN firma legal — recomendado enviar antes el enlace"
              : "Marcar cobrado (✓ con firma legal previa)"
        }
      >
        {loadingCobrar ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {cobrarNeedsWarning && (
          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900" aria-hidden></span>
        )}
      </button>
      <button
        onClick={enviarLegal}
        disabled={loadingLegal || !huesped_email}
        className={`inline-flex items-center justify-center size-7 rounded transition border border-border text-muted-foreground hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 ${enviado ? "bg-blue-100 text-blue-700" : ""}`}
        title={huesped_email ? `Enviar enlace legal a ${huesped_email}` : "Sin email"}
      >
        {loadingLegal ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
      </button>
      {error && <span className="text-[10px] text-red-700 dark:text-red-400">{error}</span>}
      {enviado && <span className="text-[10px] text-emerald-700 dark:text-emerald-400">✓</span>}
    </div>
  );
}
