"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

type Obj = { ingresos_target: number; ocupacion_target_pct: number; noches_target: number; notas: string };

export function GuardarObjetivo({ year, month, existente }: { year: number; month: number; existente: Obj | null }) {
  const [ingresos, setIngresos] = useState(existente?.ingresos_target?.toString() ?? "");
  const [ocupacion, setOcupacion] = useState(existente?.ocupacion_target_pct?.toString() ?? "");
  const [noches, setNoches] = useState(existente?.noches_target?.toString() ?? "");
  const [notas, setNotas] = useState(existente?.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const router = useRouter();

  async function guardar() {
    setGuardando(true);
    setGuardado(false);
    await fetch("/api/objetivos/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year, month,
        ingresos_target: ingresos ? parseFloat(ingresos) : null,
        ocupacion_target_pct: ocupacion ? parseFloat(ocupacion) : null,
        noches_target: noches ? parseInt(noches, 10) : null,
        notas
      })
    });
    setGuardando(false);
    setGuardado(true);
    router.refresh();
    setTimeout(() => setGuardado(false), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs">
          <div className="text-muted-foreground mb-1">Ingresos €</div>
          <input type="number" step="100" value={ingresos} onChange={e => setIngresos(e.target.value)} placeholder="0" className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm" />
        </label>
        <label className="text-xs">
          <div className="text-muted-foreground mb-1">Ocupación %</div>
          <input type="number" min="0" max="100" step="1" value={ocupacion} onChange={e => setOcupacion(e.target.value)} placeholder="0" className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm" />
        </label>
        <label className="text-xs">
          <div className="text-muted-foreground mb-1">Noches</div>
          <input type="number" min="0" step="1" value={noches} onChange={e => setNoches(e.target.value)} placeholder="0" className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm" />
        </label>
      </div>
      <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" rows={2} className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-xs" />
      <div className="flex items-center justify-end gap-2">
        {guardado && <span className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="size-3" /> Guardado</span>}
        <button onClick={guardar} disabled={guardando} className="px-3 py-1 rounded bg-foreground text-background text-xs font-medium disabled:opacity-50">{guardando ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
