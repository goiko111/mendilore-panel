"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Download, Search, FileText } from "lucide-react";

type Aceptacion = {
  id: string;
  huesped_nombre_capturado: string;
  huesped_email_capturado: string | null;
  documento_tipo: string;
  documento_version: string;
  ip_cliente: string;
  metodo: string;
  aceptado_en: string;
};

const tiposLegibles: Record<string, string> = {
  condiciones_particulares: "Condiciones particulares",
  politica_cancelacion: "Política de cancelación",
  politica_mascotas: "Política de mascotas",
  politica_privacidad: "Política de privacidad",
  cookies: "Política de cookies",
  aviso_legal: "Aviso legal",
  otro: "Otro"
};

export function EvidenciasBlock() {
  const [aceptaciones, setAceptaciones] = useState<Aceptacion[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/aceptaciones", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAceptaciones(j.aceptaciones ?? []))
      .catch(() => setAceptaciones([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const filtradas = (aceptaciones ?? []).filter((a) => {
    const q = busqueda.toLowerCase();
    if (!q) return true;
    return (
      a.huesped_nombre_capturado?.toLowerCase().includes(q) ||
      a.huesped_email_capturado?.toLowerCase().includes(q) ||
      a.documento_tipo?.toLowerCase().includes(q)
    );
  });

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="size-4 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-base font-semibold text-foreground">📜 Aceptaciones registradas (Fase 3)</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Histórico de firmas de condiciones por parte de huéspedes. Cada entrada incluye IP, fecha, versión del documento y hash SHA-256. Descarga la evidencia jurídica para usar en disputas o reclamaciones.
      </p>

      {(aceptaciones ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">
          No hay aceptaciones registradas todavía. Las aceptaciones se registran automáticamente cuando un huésped firma desde el enlace `/aceptar/[reserva]`.
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por huésped, email o tipo de documento…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-3 py-2">Huésped</th>
                  <th className="text-left font-medium px-3 py-2">Documento</th>
                  <th className="text-left font-medium px-3 py-2">Versión</th>
                  <th className="text-left font-medium px-3 py-2">Aceptado</th>
                  <th className="text-left font-medium px-3 py-2">IP</th>
                  <th className="text-right font-medium px-3 py-2">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtradas.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="text-foreground">{a.huesped_nombre_capturado}</div>
                      {a.huesped_email_capturado && (
                        <div className="text-[11px] text-muted-foreground">{a.huesped_email_capturado}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">{tiposLegibles[a.documento_tipo] ?? a.documento_tipo}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">{a.documento_version}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[11px]">
                      {new Date(a.aceptado_en).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">{a.ip_cliente}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/api/aceptaciones/${a.id}/evidencia?format=html`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <FileText className="size-3" /> Descargar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground mt-3 italic">
            Conservación garantizada de 6 años (plazo mercantil). El botón "Descargar" abre el dossier jurídico en HTML imprimible — usa Cmd/Ctrl+P para guardarlo como PDF.
          </p>
        </>
      )}
    </section>
  );
}
