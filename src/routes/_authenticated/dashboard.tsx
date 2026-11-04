import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Camera, ArrowRight, FileStack, Bell, Loader2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { Button } from "@/components/ui/button";
import { useProfile, useSession } from "@/hooks/use-auth";
import { useMyClaims, useNotifications } from "@/hooks/use-claims";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ClaimLens AI" },
      { name: "description", content: "Your claims, statuses and latest updates." },
      { property: "og:title", content: "Dashboard — ClaimLens AI" },
      { property: "og:description", content: "Your claims, statuses and latest updates." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: claims, isLoading } = useMyClaims(user?.id);
  const { data: notes } = useNotifications(user?.id, 4);

  const active = claims?.filter((c) => !["approved", "rejected", "draft"].includes(c.status)).length ?? 0;
  const approved = claims?.filter((c) => c.status === "approved").length ?? 0;
  const needsAction = claims?.filter((c) => c.status === "evidence_required") ?? [];
  const firstName = (profile?.full_name || "there").split(" ")[0];

  return (
    <AppShell>
      <section className="overflow-hidden rounded-3xl bg-card-gradient p-5 text-navy-foreground shadow-elevated">
        <p className="text-sm text-navy-foreground/70">Hello, {firstName}</p>
        <h1 className="mt-1 text-2xl font-bold">Had an accident?</h1>
        <p className="mt-1 text-sm text-navy-foreground/75">Capture live evidence now — we'll verify every photo as you go.</p>
        <Button asChild variant="hero" className="mt-4">
          <Link to="/claims/new">
            <Camera /> Submit new claim
          </Link>
        </Button>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Total" value={claims?.length ?? 0} />
        <Stat label="In progress" value={active} />
        <Stat label="Approved" value={approved} />
      </div>

      {needsAction.length > 0 && (
        <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/15 p-4">
          <p className="font-semibold">Action needed</p>
          <p className="text-sm text-muted-foreground">An investigator requested more evidence for {needsAction.length} claim(s).</p>
          <div className="mt-3 space-y-2">
            {needsAction.map((c) => (
              <ClaimCard key={c.id} claim={c} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold"><FileStack className="h-5 w-5 text-info" /> My claims</h2>
        <Link to="/claims" className="text-sm font-semibold text-primary">View all</Link>
      </div>
      <div className="mt-3 space-y-3">
        {isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : claims && claims.length > 0 ? (
          claims.slice(0, 3).map((c) => <ClaimCard key={c.id} claim={c} />)
        ) : (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-info" />
            <p className="mt-2 font-semibold">No claims yet</p>
            <p className="text-sm text-muted-foreground">When you submit a claim, you'll track every step here in real time.</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-info" /> Latest updates</h2>
        <Link to="/notifications" className="text-sm font-semibold text-primary">All</Link>
      </div>
      <ul className="mt-3 divide-y rounded-2xl border bg-card shadow-card">
        {notes && notes.length > 0 ? (
          notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-4">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-border" : "bg-info"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
            </li>
          ))
        ) : (
          <li className="p-4 text-sm text-muted-foreground">No updates yet.</li>
        )}
      </ul>
      <Link to="/claims/new" className="mt-6 flex items-center justify-center gap-1 text-sm font-semibold text-primary">
        Start a claim <ArrowRight className="h-4 w-4" />
      </Link>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3 text-center shadow-card">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
