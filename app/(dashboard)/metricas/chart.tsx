"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

type Row = { fecha: string; occupancy_pct: number; adr: number; revpar: number };

export function MetricasChart({ data }: { data: Row[] }) {
  const formatted = data.map((r) => ({
    ...r,
    fechaLabel: new Date(r.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
  }));

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="fechaLabel" className="text-xs fill-muted-foreground" />
          <YAxis className="text-xs fill-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="occupancy_pct" name="Ocupación %" stroke="#7a6b4f" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="adr" name="ADR €" stroke="#1f7a5a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="revpar" name="RevPAR €" stroke="#8a4f2a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
