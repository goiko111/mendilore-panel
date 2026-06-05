import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", user?.id ?? "").maybeSingle();

  const integraciones = [
    { name: "MisterPlan / RuralGest", status: "pendiente", note: "Bloqueador crítico. Pendiente llamada soporte 91 269 01 02 (D-117)" },
    { name: "Make.com — Org Casa Mendilore", status: "activo", note: "Org 7922550 · eu1 · Free 1.000 credits/mes (D-109)" },
    { name: "Apify Booking scraper", status: "activo", note: "Actor voyager/booking-scraper · validado D-118 con 6 URLs" },
    { name: "Supabase", status: "activo", note: "Project mendilore-panel · eu-central-1 · Free (D-108)" },
    { name: "Cloudflare Pages", status: "activo", note: "panel.mendilore.com · Pages clásico via DCV (D-110, D-111)" }
  ];

  return (
    <div>
      <PageHeader title="Configuración" description="Integraciones, usuarios y opciones del panel" />

      <div className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Tu perfil</h2>
          <p className="text-xs text-muted-foreground mb-4">Datos de tu cuenta de acceso</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Email</dt>
              <dd className="text-foreground">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Nombre</dt>
              <dd className="text-foreground">{perfil?.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Rol</dt>
              <dd className="text-foreground">{perfil?.rol ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Organización</dt>
              <dd className="text-foreground">{perfil?.organizacion ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Integraciones</h2>
          <p className="text-xs text-muted-foreground mb-4">Servicios conectados al panel</p>
          <ul className="divide-y divide-border">
            {integraciones.map((i) => (
              <li key={i.name} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{i.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{i.note}</div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  i.status === "activo"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
