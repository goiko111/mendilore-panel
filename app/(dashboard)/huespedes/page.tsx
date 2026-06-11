export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Users, ChevronRight, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatDate, formatCurrency } from "@/lib/utils";

export const metadata = { title: "Huéspedes" };

const FUENTES = ["directo", "booking", "airbnb", "expedia", "web_propia", "walk_in", "otro"];


  // Auto-inferir nacionalidad por email cuando no está en BD
  function inferNacionalidad(h: any): string | null {
    if (h.pais) return h.pais;
    if (h.nacionalidad) return h.nacionalidad;
    const email = (h.email ?? "").toLowerCase();
    if (!email) return null;
    // Booking proxy emails siempre @guest.booking.com — buscar pistas en notas/nombre
    // Por TLD genérico de email
    const tldMap: Record<string, string> = {
      ".es": "España", ".fr": "Francia", ".pt": "Portugal", ".it": "Italia",
      ".de": "Alemania", ".at": "Austria", ".ch": "Suiza", ".nl": "Países Bajos",
      ".be": "Bélgica", ".uk": "Reino Unido", ".co.uk": "Reino Unido",
      ".ie": "Irlanda", ".dk": "Dinamarca", ".se": "Suecia", ".no": "Noruega",
      ".fi": "Finlandia", ".pl": "Polonia", ".cz": "República Checa",
      ".ru": "Rusia", ".us": "EEUU", ".ca": "Canadá", ".mx": "México",
      ".ar": "Argentina", ".br": "Brasil", ".cl": "Chile", ".au": "Australia",
      ".jp": "Japón", ".cn": "China", ".kr": "Corea del Sur"
    };
    for (const [tld, pais] of Object.entries(tldMap)) {
      if (email.endsWith(tld)) return pais;
    }
    // Heurística por nombre típico holandés/alemán para emails proxy Booking
    const nombre = (h.nombre ?? "").toLowerCase();
    if (/\b(marjan|ivan|jaap|kees|wouter|ginkel)\b/i.test(nombre)) return "Países Bajos";
    if (/\b(klaus|wolfgang|fritz|hans|jurgen)\b/i.test(nombre)) return "Alemania";
    if (/\b(francois|jean|pierre|jacques)\b/i.test(nombre)) return "Francia";
    // Heurística por prefijo telefónico internacional
    const tel = String(h.telefono ?? "").replace(/[^0-9+]/g, "");
    const prefixMap: Record<string, string> = {
      "+34": "España", "+33": "Francia", "+351": "Portugal", "+39": "Italia",
      "+49": "Alemania", "+43": "Austria", "+41": "Suiza", "+31": "Países Bajos",
      "+32": "Bélgica", "+44": "Reino Unido", "+353": "Irlanda", "+45": "Dinamarca",
      "+46": "Suecia", "+47": "Noruega", "+358": "Finlandia", "+48": "Polonia",
      "+420": "República Checa", "+7": "Rusia", "+1": "EEUU/Canadá", "+52": "México",
      "+54": "Argentina", "+55": "Brasil", "+56": "Chile", "+61": "Australia",
      "+81": "Japón", "+86": "China", "+82": "Corea del Sur"
    };
    // Probar prefijos más largos primero
    const sortedPref = Object.keys(prefixMap).sort((a, b) => b.length - a.length);
    for (const pref of sortedPref) {
      if (tel.startsWith(pref)) return prefixMap[pref];
    }
    return null;
  }

export default async function HuespedesPage({ searchParams }: { searchParams: Promise<{ q?: string; pais?: string; fuente?: string; r?: string }> }) {
  const sp = await searchParams;
  const onlyRepeat = sp.r === "1";
  const supabase = await createClient();

  // 1) Cargar huéspedes (sin limit estrecho)
  let query = supabase
    .from("huespedes")
    .select("id, nombre, apellidos, email, telefono, pais, nacionalidad, fecha_alta, fuente, notas", { count: "exact" })
    .order("fecha_alta", { ascending: false })
    .limit(2000);

  if (sp.pais) query = query.eq("pais", sp.pais);
  if (sp.fuente) query = query.eq("fuente", sp.fuente);

  const { data: huespedesRaw, count } = await query;

  // 2) Cargar todas las reservas para enriquecer con KPIs por huésped
  const { data: todasReservas } = await supabase
    .from("reservas")
    .select("huesped_id, fecha_in, fecha_out, noches, importe_total, estado_cobro")
    .neq("estado_cobro", "cancelado")
    .limit(5000);

  // Mapa huesped_id → { reservas, noches, gasto, ultimaFechaIn, primeraFechaIn }
  const today = new Date().toISOString().slice(0, 10);
  const statsMap = new Map<string, { reservas: number; noches: number; gasto: number; ultima: string; primera: string; futuras: number }>();
  for (const r of todasReservas ?? []) {
    const k = r.huesped_id as string;
    if (!k) continue;
    const acc = statsMap.get(k) ?? { reservas: 0, noches: 0, gasto: 0, ultima: "", primera: "", futuras: 0 };
    acc.reservas += 1;
    acc.noches += Number(r.noches ?? 0);
    acc.gasto += Number(r.importe_total ?? 0);
    if (!acc.primera || r.fecha_in < acc.primera) acc.primera = r.fecha_in as string;
    if (!acc.ultima || r.fecha_in > acc.ultima) acc.ultima = r.fecha_in as string;
    if ((r.fecha_in as string) >= today) acc.futuras += 1;
    statsMap.set(k, acc);
  }

  // 3) Aplicar búsqueda libre
  const q = sp.q?.toLowerCase().trim();
  // Orden default: por última estancia desc (huéspedes recientes primero)
  let huespedes = q
    ? (huespedesRaw ?? []).filter((h: any) => {
        const txt = `${h.nombre ?? ""} ${h.apellidos ?? ""} ${h.email ?? ""} ${h.telefono ?? ""}`.toLowerCase();
        return txt.includes(q);
      })
    : (huespedesRaw ?? []);


  // Sort por última estancia DESC (huéspedes más recientes primero)
  huespedes = huespedes.sort((a: any, b: any) => {
    const ua = statsMap.get(a.id)?.ultima ?? "";
    const ub = statsMap.get(b.id)?.ultima ?? "";
    return ub.localeCompare(ua);
  });

  // 4) Repetidores
  if (onlyRepeat) {
    huespedes = huespedes.filter((h: any) => (statsMap.get(h.id)?.reservas ?? 0) > 1);
  }

  // 5) Países únicos
  const paisesUnicos = Array.from(new Set((huespedesRaw ?? []).map((h: any) => inferNacionalidad(h)).filter(Boolean))).sort();

  // 6) KPIs globales
  const totalRepetidores = (huespedesRaw ?? []).filter((h: any) => (statsMap.get(h.id)?.reservas ?? 0) > 1).length;
  const totalConFuturas = (huespedesRaw ?? []).filter((h: any) => (statsMap.get(h.id)?.futuras ?? 0) > 0).length;
  const totalGasto = Array.from(statsMap.values()).reduce((s, v) => s + v.gasto, 0);

  return (
    <div>
      <PageHeader
        title="Huéspedes"
        description={`${huespedes.length} de ${count ?? 0} contactos registrados`}
      />

      {/* KPIs globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Únicos" value={String(count ?? 0)} hint="En base de datos" />
        <StatCard label="Repetidores" value={String(totalRepetidores)} hint={count ? `${((totalRepetidores / (count ?? 1)) * 100).toFixed(0)}% del total` : "—"} />
        <StatCard label="Con reserva futura" value={String(totalConFuturas)} hint="Llegada próxima" />
        <StatCard label="Países distintos" value={String(paisesUnicos.length)} hint="Origen del huésped" />
      </div>

      <form method="get" className="bg-card border border-border rounded-xl p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar nombre / email / teléfono / documento"
          className="md:col-span-2 px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
        />
        <select name="pais" defaultValue={sp.pais ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">País: todos</option>
          {paisesUnicos.map((p) => <option key={p as string} value={p as string}>{p as string}</option>)}
        </select>
        <select name="fuente" defaultValue={sp.fuente ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">Fuente: todas</option>
          {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="md:col-span-4 flex gap-2 justify-between items-center">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" name="r" value="1" defaultChecked={onlyRepeat} className="rounded border-border" />
            Solo repetidores (≥2 reservas)
          </label>
          <div className="flex gap-2">
            <Link href="/huespedes" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition">
              Limpiar
            </Link>
            <button type="submit" className="bg-foreground text-background hover:bg-foreground/90 px-4 py-1.5 rounded-md font-medium">
              Filtrar
            </button>
          </div>
        </div>
      </form>

      {huespedes.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Prueba a quitar filtros o ampliar la búsqueda."
          icon={<Users className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                <th className="text-left font-medium px-5 py-2.5">Contacto</th>
                <th className="text-left font-medium px-5 py-2.5">País</th>
                <th className="text-right font-medium px-5 py-2.5">Reservas</th>
                <th className="text-right font-medium px-5 py-2.5">Noches</th>
                <th className="text-right font-medium px-5 py-2.5">Gasto total</th>
                <th className="text-left font-medium px-5 py-2.5">Última estancia</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {huespedes.map((h: any) => {
                const s = statsMap.get(h.id);
                const esRep = (s?.reservas ?? 0) > 1;
                return (
                  <tr key={h.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3 text-foreground">
                      <Link href={`/huespedes/${h.id}`} className="hover:underline inline-flex items-center gap-1.5">
                        {esRep && <Star className="size-3.5 text-amber-500 fill-amber-400 shrink-0" />}
                        <span>{`${h.nombre ?? ""} ${h.apellidos ?? ""}`.trim() || "—"}</span>
                      </Link>
                      {esRep && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">Repetidor</span>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      <div>{h.email ?? "—"}</div>
                      {h.telefono && <div className="text-[11px]">{h.telefono}</div>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{inferNacionalidad(h) ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-medium text-foreground">{s?.reservas ?? 0}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{s?.noches ?? 0}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(s?.gasto ?? 0)}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{s?.ultima ? formatDate(s.ultima) : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/huespedes/${h.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition">
                        Editar <ChevronRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
