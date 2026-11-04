import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Sparkles, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { checkOwnerNames } from "@/lib/claims.functions";
import { friendlyError } from "@/lib/claims";

export type OwnerCheckReport = {
  verdict: "match" | "mismatch" | "unreadable";
  rc_owner_name: string | null;
  insurance_holder_name: string | null;
  claimant_matches_rc_owner: "yes" | "no" | "unclear";
  explanation: string;
  suggestion: string;
  checked_at?: string;
};

export function OwnerCheckBadge({ status }: { status: string }) {
  if (status === "match") return <Badge variant="success"><CheckCircle2 /> Owner names match</Badge>;
  if (status === "mismatch") return <Badge variant="destructive"><AlertTriangle /> Owner names differ</Badge>;
  if (status === "unreadable") return <Badge variant="warning"><HelpCircle /> Names not readable</Badge>;
  return <Badge variant="muted">Owner check pending</Badge>;
}

export function OwnerCheckCard({
  claimId,
  status,
  report,
  canRun,
  blockedReason,
  onChanged,
}: {
  claimId: string;
  status: string;
  report: unknown;
  /** Show the run button (claimant, editable claim). */
  canRun?: boolean;
  blockedReason?: string;
  onChanged?: () => void;
}) {
  const runFn = useServerFn(checkOwnerNames);
  const [busy, setBusy] = useState(false);
  const r = report as OwnerCheckReport | null;

  const run = async () => {
    setBusy(true);
    try {
      const res = await runFn({ data: { claimId } });
      if (res.verdict === "match") toast.success("RC book and insurance owner names match");
      else toast.warning("Please review the owner name check result");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
      onChanged?.();
    }
  };

  return (
    <section className="rounded-2xl border bg-muted/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-info" /> AI owner name check
        </p>
        {busy ? <Badge variant="info"><Loader2 className="animate-spin" /> Reading documents…</Badge> : <OwnerCheckBadge status={status} />}
      </div>
      {r && status !== "pending" ? (
        <div className="space-y-2 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-card p-3">
              <dt className="text-xs text-muted-foreground">Owner on RC book</dt>
              <dd className="font-medium">{r.rc_owner_name ?? "Not readable"}</dd>
            </div>
            <div className="rounded-xl bg-card p-3">
              <dt className="text-xs text-muted-foreground">Insured on policy</dt>
              <dd className="font-medium">{r.insurance_holder_name ?? "Not readable"}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground">{r.explanation}</p>
          {r.claimant_matches_rc_owner === "no" && (
            <p className="rounded-xl bg-warning/15 p-3">The claimant name on this claim differs from the RC owner.</p>
          )}
          {status !== "match" && r.suggestion && <p className="rounded-xl bg-info/10 p-3">{r.suggestion}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          AI reads the owner name on the RC book and the insured name on the insurance policy and checks they are the same person.
        </p>
      )}
      {canRun && (
        <Button className="mt-3 w-full" variant={status === "pending" ? "default" : "outline"} onClick={run} disabled={busy || !!blockedReason}>
          {busy ? <Loader2 className="animate-spin" /> : <UserCheck />}
          {blockedReason ?? (status === "pending" ? "Check owner names" : "Re-check owner names")}
        </Button>
      )}
    </section>
  );
}
