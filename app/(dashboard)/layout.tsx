import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { OnboardingTour } from "@/components/onboarding-tour";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Contar notificaciones sin leer (uso admin client para sortear RLS en read crítico)
  let unreadCount = 0;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("leida", false);
    unreadCount = count ?? 0;
  } catch {
    // Si la tabla aún no existe (migration no aplicada), seguimos sin badge
    unreadCount = 0;
  }

  return (
    <div className="lg:flex min-h-screen">
      <Sidebar userEmail={user?.email} unreadCount={unreadCount} />
      <main className="flex-1 min-w-0">
        <div className="container px-4 sm:px-6 py-5 lg:py-8 max-w-7xl">{children}</div>
        <OnboardingTour />
      </main>
    </div>
  );
}
