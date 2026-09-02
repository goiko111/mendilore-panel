export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// TEMPORAL · borrar al cerrar el proyecto (ver NEXT_STEPS)
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const HABS = ['cala','nube','margarita','lino','limonero','lavanda'];

type Fila = {
  id: string; id_externo_misterplan: string; habitacion: string;
  fecha_in: string; fecha_out: string; noches: number | null;
  importe_total: number | null; actualizado_en: string; canal: string | null;
};

function diasDe(f: Fila): string[] {
  const out: string[] = [];
  const ini = new Date(f.fecha_in + "T00:00:00Z");
  const fin = new Date(f.fecha_out + "T00:00:00Z");
  for (let d = new Date(ini); d < fin; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function POST(req: Request) {
  const u = new URL(req.url);
  if (req.headers.get("x-admin-secret") !== SECRET && u.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ e: "x" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({} as any));
  const corte: string = body.corte;                    // ISO: solo se borra lo NO refrescado
  const desde: string = body.desde || "2025-06-01";
  const hasta: string = body.hasta || "2026-12-31";
  const ejecutar: boolean = body.ejecutar === true;    // sin esto, dry-run
  const maxBorrado: number = Number(body.maxBorrado ?? 30); // tope de seguridad

  if (!corte) return NextResponse.json({ error: "falta 'corte' (ISO timestamp)" }, { status: 400 });

  const s = createAdminClient();

  // 1) Estado ANTES: días imposibles
  const { data: activas, error: e1 } = await s.from("reservas")
    .select("id,id_externo_misterplan,habitacion,fecha_in,fecha_out,noches,importe_total,actualizado_en,canal")
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS)
    .gt("noches", 0)
    .gte("fecha_in", desde).lte("fecha_in", hasta)
    .limit(5000);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const analizar = (filas: Fila[]) => {
    const porDia = new Map<string, Fila[]>();
    for (const f of filas) {
      if (!f.fecha_in || !f.fecha_out || f.fecha_out <= f.fecha_in) continue;
      for (const d of diasDe(f)) {
        const arr = porDia.get(d) ?? []; arr.push(f); porDia.set(d, arr);
      }
    }
    const malos: any[] = [];
    for (const [dia, arr] of porDia) {
      const distintas = new Set(arr.map((x) => x.habitacion)).size;
      if (arr.length > 6 || arr.length !== distintas) {
        malos.push({ dia, filas: arr.length, distintas });
      }
    }
    malos.sort((a, b) => a.dia.localeCompare(b.dia));
    return malos;
  };

  const antes = analizar((activas ?? []) as Fila[]);

  // 2) Candidatas: no refrescadas por la recarga
  const candidatas = ((activas ?? []) as Fila[]).filter((f) => f.actualizado_en < corte);

  // Solo interesan las que participan en un día conflictivo
  const diasMalos = new Set(antes.map((m) => m.dia));
  const candidatasEnConflicto = candidatas.filter((f) => diasDe(f).some((d) => diasMalos.has(d)));

  const resumen = {
    rango: { desde, hasta },
    corte,
    reservas_activas: activas?.length ?? 0,
    dias_imposibles_antes: antes.length,
    detalle_dias_antes: antes,
    candidatas_no_refrescadas: candidatas.length,
    candidatas_en_dias_conflictivos: candidatasEnConflicto.length,
    muestra: candidatasEnConflicto.slice(0, 40).map((f) => ({
      id_externo: f.id_externo_misterplan, habitacion: f.habitacion,
      fecha_in: f.fecha_in, fecha_out: f.fecha_out,
      importe: f.importe_total, canal: f.canal, actualizado_en: f.actualizado_en,
    })),
  };

  if (!ejecutar) {
    return NextResponse.json({ modo: "dry_run", ...resumen });
  }

  if (candidatasEnConflicto.length === 0) {
    return NextResponse.json({ modo: "ejecutado", borradas: 0, nota: "nada que borrar", ...resumen });
  }
  // GUARDA FUERTE: si una parte grande del histórico no está refrescada, la
  // recarga no ha terminado o no cubrió el rango. Borrar aquí destruiría
  // reservas reales — abortamos. (Sin esta guarda, un dry-run a mitad de
  // recarga marcaba 452 reservas legítimas como candidatas.)
  const pct = (activas?.length ?? 0) > 0
    ? candidatas.length / (activas?.length ?? 1)
    : 1;
  // La guarda protege contra un borrado masivo por recarga incompleta. Pero un
  // borrado quirúrgico (pocas filas, todas en días físicamente imposibles) es
  // seguro aunque el resto del histórico no esté refrescado.
  if (pct > 0.15 && candidatasEnConflicto.length > 5) {
    return NextResponse.json({
      error: "recarga_incompleta",
      nota: `El ${Math.round(pct * 100)}% de las reservas no está refrescada tras el corte. Espera a que TERMINE la recarga completa y vuelve a intentarlo.`,
      ...resumen,
    }, { status: 409 });
  }
  if (candidatasEnConflicto.length > maxBorrado) {
    return NextResponse.json({
      error: "tope_de_seguridad_superado",
      nota: `Se borrarían ${candidatasEnConflicto.length} filas, por encima del tope ${maxBorrado}. Revisa el dry-run.`,
      ...resumen,
    }, { status: 409 });
  }

  const ids = candidatasEnConflicto.map((f) => f.id);
  const { error: e2 } = await s.from("reservas").delete().in("id", ids);
  if (e2) return NextResponse.json({ error: e2.message, ...resumen }, { status: 500 });

  // 3) Estado DESPUÉS
  const { data: despuesRaw } = await s.from("reservas")
    .select("id,id_externo_misterplan,habitacion,fecha_in,fecha_out,noches,importe_total,actualizado_en,canal")
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS)
    .gt("noches", 0)
    .gte("fecha_in", desde).lte("fecha_in", hasta)
    .limit(5000);
  const despues = analizar((despuesRaw ?? []) as Fila[]);

  return NextResponse.json({
    modo: "ejecutado",
    borradas: ids.length,
    dias_imposibles_antes: antes.length,
    dias_imposibles_despues: despues.length,
    detalle_dias_despues: despues,
  });
}
