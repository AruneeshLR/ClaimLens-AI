import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-claims";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — ClaimLens AI" },
      { name: "description", content: "Updates on your claim submissions, AI analysis and decisions." },
      { property: "og:title", content: "Notifications — ClaimLens AI" },
      { property: "og:description", content: "Updates on your claims." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications(user?.id, 100);

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread"] });
  };
  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["unread"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <AppShell
      title="Notifications"
      action={
        <Button variant="outline" size="sm" onClick={markAll}>
          <CheckCheck /> Mark all read
        </Button>
      }
    >
      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      ) : data && data.length ? (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id}>
              <Link
                to={n.claim_id ? "/claims/$claimId" : "/notifications"}
                params={n.claim_id ? { claimId: n.claim_id } : undefined}
                onClick={() => !n.read_at && void markOne(n.id)}
                className={cn("flex gap-3 rounded-2xl border bg-card p-4 shadow-card", !n.read_at && "border-info/40")}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", n.read_at ? "bg-muted text-muted-foreground" : "bg-info/15 text-info")}>
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{format(new Date(n.created_at), "d MMM yyyy, HH:mm")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
      )}
    </AppShell>
  );
}
