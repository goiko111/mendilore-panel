"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Edit2, Check } from "lucide-react";

export function EditarHuesped({ huesped }: { huesped: any }) {
  const [editando, setEditando] = useState(false);
  const [dni, setDni] = useState(huesped.dni ?? "");
  const [pasaporte, setPasaporte] = useState(huesped.pasaporte ?? "");
  const [fechaNac, setFechaNac] = useState(huesped.fecha_nacimiento ?? "");
  const [nacionalidad, setNacionalidad] = useState(huesped.nacionalidad ?? "");
  const [notas, setNotas] = useState(huesped.notas_privadas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const router = useRouter();

  async function guardar() {
    setGuardando(true);
    const r = await fetch("/api/huespedes/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: huesped.id, dni, pasaporte, fecha_nacimiento: fechaNac || null, nacionalidad, notas_privadas: notas })
    });
    setGuardando(false);
    if (r.ok) {
      setGuardado(true);
      setEditando(false);
      router.refresh();
      setTimeout(() => setGuardado(false), 2500);
    }
  }

  if (!editando) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Datos personales y notas</h2>
          <button onClick={() => setEditando(true)} className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border hover:bg-muted">
            <Edit2 className="size-3.5" /> Editar
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="DNI" value={dni || "—"} />
          <Field label="Pasaporte" value={pasaporte || "—"} />
          <Field label="Fecha nacimiento" value={fechaNac || "—"} />
          <Field label="Nacionalidad" value={nacionalidad || "—"} />
        </div>
        {notas && <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Notas privadas</div>
          <div className="text-sm text-foreground whitespace-pre-wrap">{notas}</div>
        </div>}
        {guardado && <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="size-3" /> Guardado</div>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-primary/40 rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Editar datos</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Input label="DNI" value={dni} onChange={setDni} placeholder="Ej. 12345678A" />
        <Input label="Pasaporte" value={pasaporte} onChange={setPasaporte} placeholder="Si no es español" />
        <Input label="Fecha de nacimiento" value={fechaNac} onChange={setFechaNac} type="date" />
        <Input label="Nacionalidad" value={nacionalidad} onChange={setNacionalidad} placeholder="Ej. Española" />
      </div>
      <label className="block">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 font-medium">Notas privadas (alergias, preferencias, peticiones especiales)</div>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm" placeholder="Sin gluten, viene con perro, prefiere habitación tranquila..." />
      </label>
      <div className="flex items-center justify-end gap-2 mt-4">
        <button onClick={() => setEditando(false)} className="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground text-sm">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="px-4 py-1.5 rounded bg-foreground text-background text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
          <Save className="size-3.5" />
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="text-sm text-foreground mt-1">{value}</div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 font-medium">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm" />
    </label>
  );
}
