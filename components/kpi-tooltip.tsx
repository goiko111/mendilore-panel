"use client";

import { useState, useEffect, useRef } from "react";
import { Info } from "lucide-react";

export type KPITooltipProps = {
  mide: string;
  calculo: string;
  origen: string;
  sistemas: string;
};

/**
 * Tooltip de origen de cada KPI tras revisión Juan (bloque 16).
 * Desktop: popover flotante. Mobile: bottom sheet.
 * v2 (jun 2026): renderiza el popover en portal-like al body via fixed positioning
 *   para evitar superposiciones por overflow:hidden en cards padres.
 */
export function KPITooltip({ mide, calculo, origen, sistemas }: KPITooltipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Posicionar bajo el botón, centrado, con offset
      const popoverWidth = 288; // w-72
      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      // Mantener dentro de la viewport con un margen 8px
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
      const top = rect.bottom + 6;
      setCoords({ top, left });
    } else if (!open) {
      setCoords(null);
    }
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center size-4 rounded-full text-muted-foreground/70 hover:text-foreground transition ml-1.5 align-middle"
        aria-label="Ver origen del dato"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <>
          {/* Desktop: popover fixed, posición calculada */}
          {coords && (
            <div
              className="hidden sm:block fixed z-[9999] w-72 bg-white dark:bg-neutral-900 border border-border rounded-lg shadow-2xl p-3 text-left pointer-events-none"
              style={{ top: `${coords.top}px`, left: `${coords.left}px`, zIndex: 9999 }}
            >
              <KPITooltipContent mide={mide} calculo={calculo} origen={origen} sistemas={sistemas} />
            </div>
          )}
          {/* Mobile: bottom sheet con backdrop */}
          <div className="sm:hidden fixed inset-0 z-[9999] bg-black/50 flex items-end" onClick={() => setOpen(false)}>
            <div className="w-full bg-popover border-t border-border rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3"></div>
              <KPITooltipContent mide={mide} calculo={calculo} origen={origen} sistemas={sistemas} />
              <button
                onClick={() => setOpen(false)}
                className="mt-4 w-full text-sm font-medium bg-muted text-foreground rounded-lg py-2"
              >Cerrar</button>
            </div>
          </div>
        </>
      )}
    </>
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

