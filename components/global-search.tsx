"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Atajo Cmd+K para abrir
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          const d = await r.json();
          setResults(d.results || []);
        }
      } catch {}
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [q]);

  function go(r: any) {
    setOpen(false);
    setQ("");
    router.push(r.href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
        title="Buscar global (Cmd+K)"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden md:inline-block ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[10vh]" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar reservas, huéspedes, tareas..."
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground text-foreground"
              />
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {q.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Empieza a escribir para buscar reservas, huéspedes o tareas...
                  <div className="mt-3 text-xs">
                    Atajo: <kbd className="px-1.5 py-0.5 rounded bg-muted/60">⌘K</kbd>
                  </div>
                </div>
              ) : loading ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Buscando...</div>
              ) : results.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Sin resultados para "{q}"</div>
              ) : (
                <div className="divide-y divide-border">
                  {results.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => go(r)}
                      className="w-full text-left px-4 py-3 hover:bg-muted transition flex items-start gap-3"
                    >
                      <span className="text-lg shrink-0">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{r.titulo}</div>
                        {r.subtitulo && <div className="text-xs text-muted-foreground">{r.subtitulo}</div>}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/60 px-2 py-0.5 rounded shrink-0">{r.tipo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
