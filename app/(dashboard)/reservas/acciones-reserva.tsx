"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, Loader2 } from "lucide-react";

export function AccionesReserva({ id, estado_cobro, huesped_email }: { id: string; estado_cobro: string; huesped_email?: string | null }) {
  const router = useRouter();
  const [loadingCobrar, setLoadingCobrar] = useState(false);
  const [loadingLegal, setLoadingLegal] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarCobrado() {
    if (estado_cobro === "cobrado") return;
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

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={marcarCobrado}
        disabled={loadingCobrar || estado_cobro === "cobrado"}
        className={`inline-flex items-center justify-center size-7 rounded transition ${
          estado_cobro === "cobrado"
            ? "bg-emerald-100 text-emerald-700 cursor-not-allowed"
            : "border border-border text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
        }`}
        title={estado_cobro === "cobrado" ? "Ya cobrado" : "Marcar cobrado"}
      >
        {loadingCobrar ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
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
