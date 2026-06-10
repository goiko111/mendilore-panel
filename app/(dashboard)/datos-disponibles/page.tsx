export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { Database, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Datos disponibles" };

type Estado = "disponible" | "calculable" | "parcial" | "no";

const CATEGORIAS: { titulo: string; emoji: string; items: { dato: string; estado: Estado; descripcion: string }[] }[] = [
  {
    titulo: "Reservas",
    emoji: "📅",
    items: [
      { dato: "Total reservas (período)", estado: "calculable", descripcion: "Cuenta de reservas según fechas filtradas" },
      { dato: "Reservas confirmadas / canceladas / completadas / no-show", estado: "disponible", descripcion: "Campo `estado_reserva` en cada reserva" },
      { dato: "Reservas por habitación", estado: "calculable", descripcion: "Agregado por columna `habitacion` (cala/nube/margarita/lino/limonero/lavanda)" },
      { dato: "Reservas futuras por ventana (7d/30d/60d/90d)", estado: "calculable", descripcion: "Filtro por fecha_in" },
      { dato: "Reservas creadas hoy (pickup)", estado: "calculable", descripcion: "Filtro por created_at" },
      { dato: "Lead time medio", estado: "calculable", descripcion: "Días entre `created_at` y `fecha_in`" },
      { dato: "ALOS — estancia media", estado: "calculable", descripcion: "Media de columna `noches` (generated column)" },
      { dato: "Cancel rate del mes", estado: "calculable", descripcion: "% canceladas vs totales del mes" },
      { dato: "Pace booking 7d / 30d", estado: "calculable", descripcion: "Ritmo de reservas nuevas en ventana móvil" },
      { dato: "Canal de origen (channel mix)", estado: "disponible", descripcion: "Campo `canal` por reserva. MrPlan no siempre devuelve canal — se ve como 'Otro' en esos casos" },
    ]
  },
  {
    titulo: "💰 Financiero / Cobros",
    emoji: "💰",
    items: [
      { dato: "Importe total por reserva", estado: "disponible", descripcion: "Campo `importe_total` (€)" },
      { dato: "Estado de cobro por reserva", estado: "disponible", descripcion: "Valores: cobrado / pendiente / fallido / reembolsado / no_aplica" },
      { dato: "Total cobrado período", estado: "calculable", descripcion: "Suma de reservas con estado_cobro='cobrado'" },
      { dato: "Total pendiente de cobro", estado: "calculable", descripcion: "Suma de reservas con estado_cobro='pendiente'" },
      { dato: "Cobros vencen <7d / <14d / <30d", estado: "calculable", descripcion: "Filtro por fecha_in próxima + estado_cobro='pendiente'" },
      { dato: "Tasa de cobro (%)", estado: "calculable", descripcion: "Cobradas / totales del período" },
      { dato: "Cobros fallidos / reembolsados", estado: "disponible", descripcion: "Estados específicos en la tabla" },
      { dato: "Ingresos diarios / mensuales", estado: "disponible", descripcion: "Vista materializada `metricas_dia.ingresos_dia`" },
      { dato: "ADR (Average Daily Rate)", estado: "calculable", descripcion: "Ingresos / noches vendidas" },
      { dato: "RevPAR", estado: "calculable", descripcion: "Ingresos / habitaciones disponibles" },
      { dato: "Pipeline futuro (importe confirmado)", estado: "calculable", descripcion: "Suma reservas futuras no canceladas" },
      { dato: "Pagos parciales individuales", estado: "parcial", descripcion: "Tabla `pagos` existe pero MrPlan no proporciona desglose; sirve para registrar pagos manuales" },
      { dato: "Reconciliación bancaria automática", estado: "no", descripcion: "NO conectamos con tu banco. Habría que evaluar Stripe/Plaid en otro proyecto" },
      { dato: "Histórico de cambios de estado_cobro", estado: "disponible", descripcion: "Tabla `audit_log` registra cada modificación automáticamente" },
    ]
  },
  {
    titulo: "Huéspedes",
    emoji: "👥",
    items: [
      { dato: "Total huéspedes únicos", estado: "calculable", descripcion: "Count distinct" },
      { dato: "Repetidores (≥2 reservas)", estado: "calculable", descripcion: "Agrupando por huésped" },
      { dato: "Países de origen", estado: "disponible", descripcion: "Campo `pais`" },
      { dato: "Top huésped por gasto", estado: "calculable", descripcion: "Suma `importe_total` por huésped" },
      { dato: "Email / Teléfono / Nombre / Apellidos", estado: "disponible", descripcion: "Datos básicos contacto" },
      { dato: "DNI / Pasaporte / Fecha nacimiento / Nacionalidad", estado: "disponible", descripcion: "Campos añadidos en migration 0012 (editables UI próxima)" },
      { dato: "Notas privadas (alergias, preferencias)", estado: "disponible", descripcion: "Campo `notas_privadas` en huéspedes (editable UI próxima)" },
      { dato: "Histórico estancias por huésped", estado: "calculable", descripcion: "JOIN huéspedes ↔ reservas" },
    ]
  },
  {
    titulo: "🏠 Inventario / Habitaciones",
    emoji: "🏠",
    items: [
      { dato: "6 habitaciones (Cala, Nube, Margarita, Lino, Limonero, Lavanda)", estado: "disponible", descripcion: "Fijo en el sistema" },
      { dato: "Habitaciones libres hoy", estado: "calculable", descripcion: "6 menos las ocupadas con fecha_in≤hoy<fecha_out" },
      { dato: "Ocupación por habitación (calendario)", estado: "calculable", descripcion: "Implementado en /calendario" },
      { dato: "Habitación más / menos solicitada", estado: "calculable", descripcion: "Agregado por número de reservas" },
      { dato: "Heatmap ocupación 90 días futuros", estado: "calculable", descripcion: "Implementado en /metricas" },
    ]
  },
  {
    titulo: "Competencia",
    emoji: "📊",
    items: [
      { dato: "Precios competencia (6 hoteles × 8 ventanas semanales)", estado: "disponible", descripcion: "Apify scraper cada lunes 07:00" },
      { dato: "Disponibilidad / Sold out competidores", estado: "disponible", descripcion: "Campo `disponible` por snapshot" },
      { dato: "Sugerencia precio Casa Mendilore", estado: "calculable", descripcion: "Heurística basada en ocupación competidores" },
      { dato: "Alertas movimiento ≥15% entre snapshots", estado: "calculable", descripcion: "Comparativa snapshots consecutivos" },
      { dato: "Tendencia precios (sparkline)", estado: "calculable", descripcion: "Requiere ≥3 snapshots — aún no disponible (solo hay 1 por hotel)" },
      { dato: "Reviews / rating competidores", estado: "disponible", descripcion: "Rating + reviews_count por hotel" },
    ]
  },
  {
    titulo: "Web / Marketing",
    emoji: "🌐",
    items: [
      { dato: "Sesiones / Usuarios / Pageviews GA4", estado: "parcial", descripcion: "Requiere añadir Service Account email a GA4 (pendiente acción Goiko)" },
      { dato: "Dashboard Looker Studio visitas", estado: "parcial", descripcion: "Informe creado y público, pero VACÍO — hay que añadirle widgets" },
      { dato: "Top páginas visitadas", estado: "parcial", descripcion: "Requiere acceso GA4" },
      { dato: "Fuentes de tráfico", estado: "parcial", descripcion: "Requiere acceso GA4" },
      { dato: "Conversiones / eventos clave", estado: "parcial", descripcion: "Requiere acceso GA4" },
      { dato: "Posiciones SERP", estado: "no", descripcion: "Requiere acceso Search Console" },
    ]
  },
  {
    titulo: "Operacional",
    emoji: "⚙️",
    items: [
      { dato: "Check-ins / Check-outs hoy", estado: "calculable", descripcion: "Filtro por fecha_in=hoy / fecha_out=hoy" },
      { dato: "Llegadas mañana / próxima llegada", estado: "calculable", descripcion: "Filtro por fecha_in" },
      { dato: "Huéspedes presentes ahora", estado: "calculable", descripcion: "fecha_in≤hoy<fecha_out" },
      { dato: "Tareas pendientes / vencidas", estado: "disponible", descripcion: "Tabla `tareas` (página /tareas)" },
      { dato: "Notificaciones in-app", estado: "disponible", descripcion: "Tabla `notificaciones` (página /notificaciones)" },
    ]
  },
  {
    titulo: "Legal / Cumplimiento",
    emoji: "⚖️",
    items: [
      { dato: "Documentos legales vigentes", estado: "disponible", descripcion: "Tabla `documentos_legales` (Aviso legal con XSS00159 + términos + cancelación + mascotas)" },
      { dato: "Huéspedes que han firmado condiciones", estado: "disponible", descripcion: "Tabla `aceptaciones_condiciones` con IP/UA/SHA256/timestamp" },
      { dato: "Enlace aceptación enviado / aceptado", estado: "disponible", descripcion: "Tabla `enlaces_legales_enviados` registra cada envío" },
      { dato: "Partes policía (RD 933/2021)", estado: "parcial", descripcion: "Tabla `partes_policia` lista. UI generación + envío automático SES.Hospedajes pendiente" },
    ]
  },
  {
    titulo: "Objetivos / Estrategia",
    emoji: "🎯",
    items: [
      { dato: "Target ingresos mensual", estado: "disponible", descripcion: "Tabla `objetivos_mensuales` editable en /objetivos" },
      { dato: "Target ocupación mensual", estado: "disponible", descripcion: "Tabla `objetivos_mensuales`" },
      { dato: "Cumplimiento % vs target", estado: "calculable", descripcion: "Ingresos reales / target × 100" },
      { dato: "Comparativa año anterior", estado: "calculable", descripcion: "Requiere histórico 365+ días en BD" },
    ]
  }
];

const ESTADO_INFO: Record<Estado, { color: string; icon: any; label: string }> = {
  disponible: { color: "text-emerald-700 dark:text-emerald-400", icon: CheckCircle2, label: "Disponible directo" },
  calculable: { color: "text-blue-700 dark:text-blue-400", icon: CheckCircle2, label: "Calculable" },
  parcial: { color: "text-amber-700 dark:text-amber-400", icon: AlertCircle, label: "Parcial / requiere acción" },
  no: { color: "text-red-700 dark:text-red-400", icon: XCircle, label: "No disponible" }
};

export default async function DatosDisponiblesPage() {
  const totales = CATEGORIAS.reduce((acc, c) => {
    c.items.forEach(i => { acc[i.estado] = (acc[i.estado] ?? 0) + 1; });
    return acc;
  }, {} as Record<Estado, number>);

  return (
    <div>
      <PageHeader
        title="Datos disponibles"
        description="Qué información puede mostrar el panel sobre Casa Mendilore — categorizado y con estado"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["disponible", "calculable", "parcial", "no"] as Estado[]).map((e) => {
          const info = ESTADO_INFO[e];
          const Icon = info.icon;
          return (
            <div key={e} className={`bg-card border border-border rounded-xl p-4`}>
              <div className={`flex items-center gap-2 mb-1 ${info.color}`}>
                <Icon className="size-4" />
                <span className="text-xs font-medium uppercase tracking-wide">{info.label}</span>
              </div>
              <div className="text-2xl font-semibold text-foreground tabular-nums">{totales[e] ?? 0}</div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {CATEGORIAS.map((cat) => (
          <div key={cat.titulo} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
              <span className="text-xl">{cat.emoji}</span>
              <h2 className="text-base font-semibold text-foreground">{cat.titulo}</h2>
              <span className="ml-auto text-xs text-muted-foreground">{cat.items.length} datos</span>
            </div>
            <div className="divide-y divide-border">
              {cat.items.map((item, idx) => {
                const info = ESTADO_INFO[item.estado];
                const Icon = info.icon;
                return (
                  <div key={idx} className="px-5 py-3 flex items-start gap-3">
                    <Icon className={`size-4 shrink-0 mt-0.5 ${info.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{item.dato}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.descripcion}</div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-muted/60 ${info.color}`}>
                      {info.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
        <p className="text-sm text-foreground">
          <strong>💡 ¿Querés ver alguno de estos datos en el Resumen?</strong>{" "}
          Ve a la pantalla <strong>Resumen</strong>, pulsa "Personalizar KPIs" y elige los 4 que más te interesen. Se guardan por usuario, así que Anabel y Juan pueden tener vistas distintas.
        </p>
      </div>
    </div>
  );
}
