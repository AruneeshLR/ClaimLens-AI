import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileStack, Home, Plus, UserRound } from "lucide-react";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate, useSession } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function useUnreadCount(userId: string | undefined) {
  useRealtimeInvalidate("notifications", userId ? `user_id=eq.${userId}` : undefined, [["unread", userId], ["notifications", userId]], !!userId);
  return useQuery({
    queryKey: ["unread", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      return count ?? 0;
    },
  });
}

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/claims", label: "Claims", icon: FileStack },
  { to: "/claims/new", label: "New", icon: Plus, primary: true },
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const { user } = useSession();
  const { data: unread = 0 } = useUnreadCount(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-soft">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/dashboard" aria-label="ClaimLens home">
            <Logo />
          </Link>
          <Link to="/notifications" className="relative rounded-full p-2 hover:bg-accent" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
        {(title || action) && (
          <div className="mb-5 flex items-center justify-between gap-3">
            {title && <h1 className="text-2xl font-bold">{title}</h1>}
            {action}
          </div>
        )}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur safe-bottom" aria-label="Main">
        <ul className="mx-auto grid max-w-3xl grid-cols-5 px-2 pt-1.5">
          {NAV.map((n) => {
            const active =
              n.to === "/claims"
                ? pathname === "/claims" || (pathname.startsWith("/claims/") && pathname !== "/claims/new")
                : pathname === n.to;
            const Icon = n.icon;
            return (
              <li key={n.to} className="flex justify-center">
                <Link
                  to={n.to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {"primary" in n ? (
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
                      <Icon className="h-5 w-5" />
                    </span>
                  ) : (
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {n.to === "/notifications" && unread > 0 && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-destructive" />}
                    </span>
                  )}
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
