import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={user?.email} />
      <main className="flex-1 overflow-auto">
        <div className="container py-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
