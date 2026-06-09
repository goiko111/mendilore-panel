"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard, CalendarRange, Users, LineChart, TrendingUp, Settings, LogOut, Menu, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);

  // Cerrar el drawer cuando cambie la ruta
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navContent = (
    <>
      <div className="px-5 py-5 border-b border-border flex items-center gap-3">
        <div className="size-10 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-white font-serif text-lg shrink-0" aria-label="Casa Mendilore">
          M
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Panel</div>
          <div className="text-sm font-semibold text-foreground leading-tight">Casa Mendilore</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition",
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
    </>
  );

  return (
    <>
      {/* Top bar mobile */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-card border-b border-border px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="size-9 rounded-md inline-flex items-center justify-center hover:bg-muted -ml-1"
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-white font-serif text-sm shrink-0" aria-label="Casa Mendilore">
            M
          </div>
          <div className="text-sm font-semibold text-foreground truncate">Casa Mendilore</div>
        </div>
      </div>

      {/* Desktop sidebar fijo */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-card flex-col h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-screen w-72 max-w-[85vw] border-r border-border bg-card flex flex-col transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 size-8 rounded-md inline-flex items-center justify-center hover:bg-muted"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
        {navContent}
      </aside>
    </>
  );
}
