"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";

export function NuevaTareaForm() {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha_limite, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const router = useRouter();

  async function crear() {
    if (!titulo.trim()) return;
    const res = await fetch("/api/tareas/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, descripcion, fecha_limite: fecha_limite || null, prioridad })
    });
    if (res.ok) {
      setTitulo(""); setDescripcion(""); setFecha(""); setPrioridad("normal");
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 px-3 py-1.5 rounded-md text-sm font-medium transition">
        <Plus className="size-4" /> Nueva tarea
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 w-full md:w-[600px] shadow-sm">
      <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título de la tarea" className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm mb-2" />
      <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" rows={2} className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm mb-2" />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input type="date" value={fecha_limite} onChange={e => setFecha(e.target.value)} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm" />
        <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm">
          <option value="baja">Prioridad baja</option>
          <option value="normal">Prioridad normal</option>
          <option value="alta">Prioridad alta 🔴</option>
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground text-sm">Cancelar</button>
        <button onClick={crear} disabled={!titulo.trim()} className="px-4 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 text-sm font-medium disabled:opacity-50">Crear tarea</button>
      </div>
    </div>
  );
}

export function ToggleTarea({ id, completada }: { id: string; completada: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch("/api/tareas/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completada: !completada })
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={toggle} disabled={loading} className={`size-5 rounded border-2 shrink-0 flex items-center justify-center transition ${completada ? "bg-emerald-600 border-emerald-600 text-white" : "border-border hover:border-foreground"}`}>
      {completada && <Check className="size-3.5" />}
    </button>
  );
}
