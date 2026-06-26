import { KPITooltip } from "./kpi-tooltip";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, trend, tooltip }: { label: string; value: string; hint?: string; trend?: "up" | "down" | "flat"; tooltip?: { mide: string; calculo: string; origen: string; sistemas: string } }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center">{label}{tooltip ? <KPITooltip {...tooltip} /> : null}</div>
      <div className="text-2xl font-semibold text-foreground mt-2">{value}</div>
      {hint && (
        <div className="text-xs text-muted-foreground mt-1.5">
          {trend === "up" && <span className="text-emerald-600 mr-1">▲</span>}
          {trend === "down" && <span className="text-red-600 mr-1">▼</span>}
          {hint}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl bg-card/50">
      {icon && <div className="inline-flex items-center justify-center size-12 rounded-full bg-muted text-muted-foreground mb-4">{icon}</div>}
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
    </div>
  );
}
