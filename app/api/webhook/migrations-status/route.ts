export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const results:any={};
  // Tests
  const tests = [
    { key: "aceptaciones_recordatorios (0017)", check: async () => await s.from("aceptaciones_recordatorios").select("*",{count:'exact',head:true}) },
    { key: "reservas.legal_enviado_en (0018)", check: async () => await s.from("reservas").select("legal_enviado_en").limit(1) },
    { key: "competidores.es_propia (0019)", check: async () => await s.from("competidores").select("es_propia").limit(1) },
    { key: "adr_propio_para_fecha (0019 fn)", check: async () => await s.rpc("adr_propio_para_fecha", { p_fecha: "2026-07-16" }) },
    // Payload con valores VÁLIDOS: antes usaba canal/habitacion/estado="test",
    // que violan los CHECK y daban un falso negativo permanente.
    // Se usa un id_reserva sintético estable para no ensuciar el histórico.
    { key: "upsert_desglose (0020)", check: async () => await s.rpc("upsert_reserva_misterplan", { payload: { id_reserva: "diag-selftest", importe_alojamiento: 100, importe_complementarios: 5, canal: "otro", habitacion: "cala", fecha_in: "2000-01-01", fecha_out: "2000-01-02", noches: 1, huesped_nombre: "DIAG SELFTEST", importe_total: 105, importe_moneda: "EUR", anticipo: 0, pendiente_cobro: 105, estado_reserva: "cancelada", estado_cobro: "pendiente", fecha_reserva: "2000-01-01T00:00:00" } }) },
    { key: "reservas_pendientes_firma view (0015)", check: async () => await s.from("reservas_pendientes_firma").select("*",{count:'exact',head:true}) },
  ];
  for (const t of tests) {
    try {
      const r: any = await t.check();
      results[t.key] = r.error ? { OK: false, err: r.error.message, code: r.error.code } : { OK: true, note: "existe" };
    } catch (e: any) {
      results[t.key] = { OK: false, exception: e.message };
    }
  }
  return NextResponse.json(results);
}


