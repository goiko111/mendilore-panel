"use client";

import { useEffect, useState } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";

const PASOS = [
  {
    titulo: "👋 Bienvenido al panel de Casa Mendilore",
    contenido: "Este es tu centro de control. Desde aquí gestionas reservas, huéspedes, métricas, competencia y mucho más. Vamos a ver lo básico en 30 segundos."
  },
  {
    titulo: "🎯 Personalizar el Resumen",
    contenido: "La pantalla Resumen muestra los datos más importantes de hoy. Pulsa 'Personalizar KPIs' para elegir qué información quieres ver. Cada usuario tiene su configuración propia."
  },
  {
    titulo: "📅 Reservas y Calendario",
    contenido: "En Reservas tienes el listado completo con filtros. En cada fila puedes marcar como cobrada (✅) o mandar el enlace legal al huésped (📧). En Calendario ves la ocupación por habitación tipo Booking Extranet."
  },
  {
    titulo: "💰 Cobros — todo lo que necesitas",
    contenido: "El panel sabe qué cobros tienes pendientes, te alerta cuando vencen los próximos al check-in y te muestra el % de tasa de cobro. Cada cambio queda registrado automáticamente en el audit log."
  },
  {
    titulo: "📊 Métricas + Competencia",
    contenido: "En Métricas tienes los KPIs operacionales (ocupación, ADR, ALOS, Pace 30/60/90) con heatmap calendario. En Competencia ves precios de los 6 hoteles rivales con sugerencia automática para Casa Mendilore."
  },
  {
    titulo: "✅ Listo para empezar",
    contenido: "Cuando tengas dudas sobre qué datos puede mostrar el panel, mira la sección 'Datos disponibles' del menú. Y recuerda: el sistema corre solo — las reservas de MrPlan se sincronizan cada 2h automáticamente."
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
