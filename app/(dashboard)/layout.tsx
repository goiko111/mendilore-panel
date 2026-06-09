import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="lg:flex min-h-screen">
      <Sidebar userEmail={user?.email} />
      <main className="flex-1 min-w-0">
        <div className="container px-4 sm:px-6 py-5 lg:py-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
