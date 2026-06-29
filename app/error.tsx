"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log a consola para diagnóstico
    console.error("[PANEL ERROR]", error.message, error.stack, error.digest);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 p-6">
      <div className="max-w-xl w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
        <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Casa Mendilore · Algo no ha cargado</div>
        <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">Hemos detectado un fallo en esta pantalla</h1>
        <p className="text-sm text-stone-700 dark:text-stone-300 mb-4">
          Casi siempre se arregla con un <strong>refresco fuerte</strong> (Ctrl+Shift+R en Windows, ⌘+Shift+R en Mac).
          Si el problema sigue, pulsa el botón de abajo para intentar recargar la pantalla.
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={reset}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Recargar
          </button>
          <a
            href="/dashboard"
            className="border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Ir al Resumen
          </a>
        </div>

        <details className="text-[11px] text-stone-500 mt-3">
          <summary className="cursor-pointer hover:text-stone-700">Detalle técnico (para soporte)</summary>
          <div className="mt-2 p-2 bg-stone-100 dark:bg-stone-950 rounded font-mono text-[10px] break-all">
            <div><strong>Mensaje:</strong> {error.message || "(sin mensaje)"}</div>
            {error.digest && <div className="mt-1"><strong>Digest:</strong> {error.digest}</div>}
          </div>
          <p className="mt-2">Si esto se repite, contacta con GUGO Creative.</p>
        </details>
      </div>
    </div>
  );
}
