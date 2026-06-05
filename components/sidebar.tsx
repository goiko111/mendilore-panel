"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LayoutDashboard, CalendarRange, Users, LineChart, TrendingUp, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/reservas", label: "Reservas", icon: CalendarRange },
  { href: "/huespedes", label: "Huéspedes", icon: Users },
  { href: "/metricas", label: "Métricas", icon: LineChart },
  { href: "/competencia", label: "Competencia", icon: TrendingUp },
  { href: "/configuracion", label: "Configuración", icon: Settings }
];

export function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Panel</div>
        <div className="text-base font-semibold text-foreground">Casa Mendilore</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        {userEmail && (
          <div className="px-2 py-1.5">
            <div className="text-xs text-muted-foreground">Conectado como</div>
            <div className="text-sm text-foreground truncate" title={userEmail}>{userEmail}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <LogOut className="size-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
