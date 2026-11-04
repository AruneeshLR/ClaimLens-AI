import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronRight, Car } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Claim } from "@/lib/claims";

export function ClaimCard({ claim }: { claim: Claim }) {
  const draft = claim.status === "draft";
  return (
    <Link
      to={draft ? "/claims/new" : "/claims/$claimId"}
      params={draft ? undefined : { claimId: claim.id }}
      search={draft ? { draft: claim.id } : undefined}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition hover:border-ring/40"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Car className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs font-semibold text-muted-foreground">{claim.claim_number}</p>
        </div>
        <p className="truncate font-semibold">
          {claim.accident_type} · {claim.vehicle_registration}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={claim.status} />
          <span className="text-xs text-muted-foreground">{format(new Date(claim.accident_at), "d MMM yyyy")}</span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}
