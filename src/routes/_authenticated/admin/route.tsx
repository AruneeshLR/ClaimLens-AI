import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const user = (context as { user?: { id: string } }).user;
    if (!user) throw redirect({ to: "/admin-login" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/admin-login", search: { denied: 1 } });
  },
  head: () => ({
    meta: [
      { title: "Investigator console — ClaimLens AI" },
      { name: "description", content: "Review evidence, AI reports and decide insurance claims." },
      { property: "og:title", content: "Investigator console — ClaimLens AI" },
      { property: "og:description", content: "Review evidence, AI reports and decide claims." },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const signOut = useSignOut();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-navy text-navy-foreground">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/admin" className="flex items-center gap-3">
            <Logo inverted />
            <span className="hidden items-center gap-1 rounded-full bg-navy-foreground/10 px-2.5 py-0.5 text-xs font-semibold text-sky sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Investigator
            </span>
          </Link>
          <Button variant="heroOutline" size="sm" onClick={() => void signOut("local", "/admin-login")}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
