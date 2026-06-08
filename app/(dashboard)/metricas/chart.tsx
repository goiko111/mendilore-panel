"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

type Row = {
  fecha: string;
  occupancy_pct: number | string;
  adr: number | string;
  revpar: number | string;
};

export function MetricasChart({ data }: { data: Row[] }) {
  const formatted = data.map((r) => ({
    fechaLabel: new Date(r.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
    occupancy_pct: Number(r.occupancy_pct) || 0,
    adr: Number(r.adr) || 0,
    revpar: Number(r.revpar) || 0
  }));

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 10, right: 40, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: "#78716c" }} />
          <YAxis yAxisId="pct" orientation="left" tick={{ fontSize: 11, fill: "#78716c" }} domain={[0, 100]} unit="%" />
          <YAxis yAxisId="eur" orientation="right" tick={{ fontSize: 11, fill: "#78716c" }} unit="€" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fafaf9",
              border: "1px solid #e7e5e4",
              borderRadius: 6,
              fontSize: 12
            }}
            formatter={(value: any, name: string) => {
              if (name === "Ocupación %") return [`${Number(value).toFixed(1)}%`, name];
              return [`${Math.round(Number(value))} €`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="pct" type="monotone" dataKey="occupancy_pct" name="Ocupación %" stroke="#7a6b4f" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: "#7a6b4f" }} activeDot={{ r: 5 }} />
          <Line yAxisId="eur" type="monotone" dataKey="adr" name="ADR €" stroke="#1f7a5a" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: "#1f7a5a" }} activeDot={{ r: 5 }} />
          <Line yAxisId="eur" type="monotone" dataKey="revpar" name="RevPAR €" stroke="#8a4f2a" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: "#8a4f2a" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
