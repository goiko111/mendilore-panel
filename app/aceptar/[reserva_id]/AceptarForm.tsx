"use client";

import { useState } from "react";

type Documento = {
  id: string;
  tipo: string;
  version: string;
  titulo: string;
  contenido: string;
};

const TIPOS_LEGIBLES: Record<string, string> = {
  condiciones_particulares: "Condiciones particulares de la estancia",
  politica_cancelacion: "Política de cancelación",
  politica_mascotas: "Política de mascotas"
};

export default function AceptarForm({
  reservaId,
  huespedNombre,
  huespedEmail,
  documentos,
  yaAceptados
}: {
  reservaId: string;
  huespedNombre: string;
  huespedEmail: string | null;
  documentos: Documento[];
  yaAceptados: string[];
}) {
  const [nombre, setNombre] = useState(huespedNombre || "");
  const [email, setEmail] = useState(huespedEmail || "");
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    Object.fromEntries(documentos.map((d) => [d.id, yaAceptados.includes(d.id)]))
  );
  const [expandido, setExpandido] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; message: string } | null>(null);

  const todosMarcados = documentos.every((d) => marcados[d.id]);
  const documentosAEnviar = documentos.filter((d) => marcados[d.id] && !yaAceptados.includes(d.id));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!todosMarcados) {
      setResultado({ ok: false, message: "Debes marcar las 3 casillas para continuar." });
      return;
    }
    if (nombre.trim().length < 2) {
      setResultado({ ok: false, message: "Por favor, indica tu nombre completo." });
      return;
    }
    setSubmitting(true);
    setResultado(null);
    try {
      const res = await fetch("/api/aceptar-condiciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          huesped_nombre: nombre.trim(),
          huesped_email: email.trim() || undefined,
          reserva_id: reservaId,
          documento_legal_ids: documentosAEnviar.map((d) => d.id),
          metodo: "checkbox_web",
          url_pagina: typeof window !== "undefined" ? window.location.href : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setResultado({ ok: false, message: data.error ?? "No se pudieron registrar las aceptaciones. Inténtalo de nuevo." });
      } else {
        setResultado({
          ok: true,
          message: `Hecho. Se han registrado ${data.aceptaciones?.length ?? 0} aceptaciones. Recibirás confirmación por email.`
        });
      }
    } catch {
      setResultado({ ok: false, message: "Error de red. Inténtalo de nuevo en un momento." });
    } finally {
      setSubmitting(false);
    }
  }

  if (resultado?.ok) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-5 text-sm text-emerald-900 dark:text-emerald-100">
        <div className="font-semibold mb-1">Condiciones aceptadas correctamente</div>
        <p>{resultado.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
        <label className="block text-sm">
          <span className="text-stone-700 dark:text-stone-300 font-medium">Nombre completo</span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            minLength={2}
            className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-700 dark:text-stone-300 font-medium">Email <span className="text-stone-400 font-normal">(opcional)</span></span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
      </div>

      <div className="space-y-3">
        {documentos.map((d) => {
          const yaAceptado = yaAceptados.includes(d.id);
          const isOpen = expandido === d.id;
          return (
            <div key={d.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
              <label className="flex items-start gap-3 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!marcados[d.id]}
                  disabled={yaAceptado}
                  onChange={(e) => setMarcados({ ...marcados, [d.id]: e.target.checked })}
                  className="mt-0.5 size-4 text-emerald-600 rounded border-stone-300"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-stone-900 dark:text-stone-100">
                    He leído y acepto: {TIPOS_LEGIBLES[d.tipo] ?? d.titulo}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Versión {d.version}
                    {yaAceptado && <span className="ml-2 text-emerald-700 dark:text-emerald-400">(ya aceptado)</span>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setExpandido(isOpen ? null : d.id); }}
                    className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    {isOpen ? "Ocultar texto completo" : "Leer texto completo"}
                  </button>
                </div>
              </label>
              {isOpen && (
                <div className="bg-stone-50 dark:bg-stone-950 border-t border-stone-200 dark:border-stone-800 px-4 py-3 max-h-72 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs text-stone-700 dark:text-stone-300 font-sans leading-relaxed">{d.contenido}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {resultado && !resultado.ok && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {resultado.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!todosMarcados || submitting || documentosAEnviar.length === 0}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 dark:disabled:bg-stone-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition"
      >
        {submitting ? "Registrando..." : todosMarcados ? "Aceptar y enviar" : "Marca las 3 casillas para continuar"}
      </button>

      <p className="text-xs text-stone-500 text-center">
        Tu aceptación quedará registrada con marca de tiempo UTC, IP y hash SHA-256 de los textos exactos que ves arriba. Conservación 6 años conforme al plazo mercantil.
      </p>
    </form>
  );
}
