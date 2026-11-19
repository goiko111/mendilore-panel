"use client";

import { useEffect, useState } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";

const PASOS = [
  {
    titulo: "👋 Bienvenido al panel de Casa Mendilore",
    contenido: "Este es tu centro de control. Desde aquí ves reservas, huéspedes, cobros, métricas y competencia. Vamos a ver lo básico en 30 segundos."
  },
  {
    titulo: "🎯 Personalizar el Resumen",
    contenido: "La pantalla Resumen muestra lo importante de hoy: llegadas, salidas, cobros y alertas. Pulsa 'Personalizar KPIs' para elegir qué tarjetas ver; la elección se guarda en este navegador."
  },
  {
    titulo: "📅 Reservas",
    contenido: "En Reservas tienes el listado completo con filtros y la exportación a Excel (CSV). En cada reserva puedes enviar al huésped el enlace para aceptar las condiciones (📧): se firma una vez por reserva."
  },
  {
    titulo: "💰 Cobros",
    contenido: "El Resumen te enseña qué cobros dependen de vosotros: la Tesorería y la lista de reservas que entran en los próximos 14 días sin cobrar. El estado de cobro sale de MisterPlan: registrad allí cada cobro y el panel lo recoge en la siguiente sincronización."
  },
  {
    titulo: "📊 Métricas, Comparativa y Competencia",
    contenido: "En Métricas y en la Comparativa YoY eliges un periodo y ves ocupación, ADR, ingresos y noches frente al año anterior. En Competencia, los precios en Booking de los hoteles de la zona para las próximas fechas."
  },
  {
    titulo: "✅ Listo para empezar",
    contenido: "Cada indicador tiene una «i» que explica qué mide y cómo se calcula. Las reservas de MisterPlan se sincronizan solas cada 2 horas de 8:00 a 22:00 y de madrugada."
  }
];

export function OnboardingTour() {
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    try {
      const visto = localStorage.getItem("onboarding_visto");
      if (!visto) setActivo(true);
    } catch {}
  }, []);

  function siguiente() {
    if (paso < PASOS.length - 1) {
      setPaso(paso + 1);
    } else {
      cerrar();
    }
  }

  function cerrar() {
    try { localStorage.setItem("onboarding_visto", "1"); } catch {}
    setActivo(false);
  }

  function resetear() {
    try { localStorage.removeItem("onboarding_visto"); } catch {}
    setPaso(0);
    setActivo(true);
  }

  if (!activo) {
    // Mostrar botón flotante para reabrir
    return (
      <button
        onClick={resetear}
        className="hidden lg:inline-flex fixed bottom-4 right-4 z-30 items-center gap-1.5 bg-card border border-border shadow-sm hover:shadow-md text-xs px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground transition"
        title="Ver tour de bienvenida"
      >
        <Sparkles className="size-3.5" />
        ¿Cómo usar el panel?
      </button>
    );
  }

  const p = PASOS[paso];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={cerrar}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div className="text-xs text-muted-foreground font-medium">Paso {paso + 1} de {PASOS.length}</div>
          <button onClick={cerrar} className="size-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{p.titulo}</h3>
        <p className="text-sm text-muted-foreground mb-5">{p.contenido}</p>

        <div className="flex items-center gap-1 mb-5">
          {PASOS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded ${i <= paso ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={cerrar} className="text-xs text-muted-foreground hover:text-foreground">
            Saltar tour
          </button>
          <button onClick={siguiente} className="bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-md text-sm font-medium inline-flex items-center gap-1.5">
            {paso < PASOS.length - 1 ? (
              <>Siguiente <ChevronRight className="size-4" /></>
            ) : (
              <>Empezar a usar el panel <Sparkles className="size-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
