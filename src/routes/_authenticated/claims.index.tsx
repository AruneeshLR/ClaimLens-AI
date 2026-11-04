import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-auth";
import { useMyClaims } from "@/hooks/use-claims";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/claims/")({
  head: () => ({
    meta: [
      { title: "My claims — ClaimLens AI" },
      { name: "description", content: "All your insurance claims and their live status." },
      { property: "og:title", content: "My claims — ClaimLens AI" },
      { property: "og:description", content: "All your insurance claims and their live status." },
    ],
  }),
  component: ClaimsList,
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "action", label: "Action needed" },
  { key: "closed", label: "Closed" },
  { key: "draft", label: "Drafts" },
] as const;

function ClaimsList() {
  const { user } = useSession();
  const { data: claims, isLoading } = useMyClaims(user?.id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const list = (claims ?? []).filter((c) =>
    filter === "all"
      ? true
      : filter === "active"
        ? ["submitted", "under_ai_analysis", "under_human_review"].includes(c.status)
        : filter === "action"
          ? c.status === "evidence_required"
          : filter === "closed"
            ? ["approved", "rejected"].includes(c.status)
            : c.status === "draft",
  );
  return (
    <AppShell
      title="My claims"
      action={
        <Button asChild size="sm">
          <Link to="/claims/new"><Plus /> New</Link>
        </Button>
      }
    >
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : list.length ? (
          list.map((c) => <ClaimCard key={c.id} claim={c} />)
        ) : (
          <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">No claims here.</p>
        )}
      </div>
    </AppShell>
  );
}
