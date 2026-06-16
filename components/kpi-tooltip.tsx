"use client";

import { useState } from "react";
import { Info } from "lucide-react";

export type KPITooltipProps = {
  /** Qué mide exactamente (frase corta en castellano) */
  mide: string;
  /** Cómo se calcula (fórmula explicada) */
  calculo: string;
  /** De dónde procede el dato */
  origen: string;
  /** Qué sistemas intervienen */
  sistemas: string;
};

/**
 * Tooltip de origen de cada KPI tras revisión Juan (bloque 16).
 * Hover en escritorio, tap en móvil. Muestra 4 campos: qué mide, cómo se calcula, origen y sistemas.
 */
export function KPITooltip({ mide, calculo, origen, sistemas }: KPITooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle ml-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center size-4 rounded-full text-muted-foreground/70 hover:text-foreground transition"
        aria-label="Ver origen del dato"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="hidden sm:block absolute z-50 left-1/2 -translate-x-1/2 mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-3 text-left">
            <KPITooltipContent mide={mide} calculo={calculo} origen={origen} sistemas={sistemas} />
          </div>
          <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(false)}>
            <div className="w-full bg-popover border-t border-border rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <KPITooltipContent mide={mide} calculo={calculo} origen={origen} sistemas={sistemas} />
            </div>
          </div>
        </>
      )}
    </span>
  );
}

function KPITooltipContent({ mide, calculo, origen, sistemas }: KPITooltipProps) {
  return (
    <div className="space-y-2 text-[11px]">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">📊 Qué mide</div>
        <div className="text-foreground leading-snug">{mide}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">🧮 Cómo se calcula</div>
        <div className="text-foreground leading-snug">{calculo}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">📥 De dónde procede</div>
        <div className="text-foreground leading-snug">{origen}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">⚙️ Sistemas que intervienen</div>
        <div className="text-foreground leading-snug">{sistemas}</div>
      </div>
    </div>
  );
}
