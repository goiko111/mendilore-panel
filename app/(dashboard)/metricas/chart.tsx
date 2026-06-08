"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

type Row = {
  fecha: string;
  occupancy_pct: number;
  adr: number;
  revpar: number;
  ingresos_semana?: number;
  noches?: number;
};

export function MetricasChart({ data }: { data: Row[] }) {
  const formatted = data.map((r) => {
    const d = new Date(r.fecha);
    return {
      ...r,
      fechaLabel: d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      occupancy_pct: Math.round(Number(r.occupancy_pct) * 10) / 10,
      adr: Math.round(Number(r.adr)),
      revpar: Math.round(Number(r.revpar))
    };
  });

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={formatted} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: "#78716c" }} />
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 11, fill: "#78716c" }}
            label={{ value: "Ocupación %", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#78716c" } }}
            domain={[0, 100]}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#78716c" }}
            label={{ value: "€", angle: 0, position: "insideRight", style: { fontSize: 11, fill: "#78716c" } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fafaf9",
              border: "1px solid #e7e5e4",
              borderRadius: 6,
              fontSize: 12
            }}
            formatter={(value: any, name: string) => {
              if (name === "Ocupación %") return [`${value}%`, name];
              return [`${value} €`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="occupancy_pct" name="Ocupación %" fill="#d6cdb8" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="adr" name="ADR €" stroke="#1f7a5a" strokeWidth={2} dot={{ r: 3 }} />
          <Line yAxisId="right" type="monotone" dataKey="revpar" name="RevPAR €" stroke="#8a4f2a" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
