import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, BadgeCheck, Bot, CheckCircle2, FileText, Loader2, PartyPopper, RefreshCcw, Send, XCircle } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { StatusBadge, StatusTimeline } from "@/components/claims/StatusBadge";
import { PhotoSlot, QualityBadge } from "@/components/claims/PhotoSlot";
import { DocumentUploader, openEvidenceFile } from "@/components/claims/DocumentUploader";
import { EvidenceImage } from "@/components/claims/EvidenceImage";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate, useSession } from "@/hooks/use-auth";
import { useClaimEvidence } from "@/hooks/use-claims";
import { ANGLE_LABEL, DOC_KINDS, formatMoney, friendlyError } from "@/lib/claims";
import { runInvestigation } from "@/lib/claims.functions";

export const Route = createFileRoute("/_authenticated/claims/$claimId")({
  validateSearch: z.object({ submitted: z.coerce.number().optional() }),
  head: () => ({
    meta: [
      { title: "Claim status — ClaimLens AI" },
      { name: "description", content: "Track your claim's investigation status and decision." },
      { property: "og:title", content: "Claim status — ClaimLens AI" },
      { property: "og:description", content: "Track your claim's investigation status and decision." },
    ],
  }),
  component: ClaimDetail,
});

function ClaimDetail() {
  const { claimId } = Route.useParams();
  const { submitted } = Route.useSearch();
  const { user } = useSession();
  const runInv = useServerFn(runInvestigation);
  const [retrying, setRetrying] = useState(false);
  const [sending, setSending] = useState(false);

  useRealtimeInvalidate("claims", `id=eq.${claimId}`, [["claim", claimId], ["decisions", claimId], ["evidence", claimId]]);

  const { data: claim, isLoading, refetch } = useQuery({
    queryKey: ["claim", claimId],
    queryFn: async () => {
      const { data, error } = await supabase.from("claims").select("*").eq("id", claimId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: evidence = [], refetch: refetchEvidence } = useClaimEvidence(claimId);
  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_decisions")
        .select("id, decision, remarks, reason, approved_amount, requested_items, created_at")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <AppShell><Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /></AppShell>;
  if (!claim || claim.user_id !== user?.id)
    return (
      <AppShell>
        <p className="text-center text-muted-foreground">Claim not found.</p>
      </AppShell>
    );

  const photos = evidence.filter((e) => e.kind === "photo");
  const docs = evidence.filter((e) => e.kind !== "photo");
  const additional = evidence.filter((e) => e.is_additional);
  const defaults = { incident_date: claim.accident_at.slice(0, 10), incident_location: claim.accident_location };

  const retryAi = async () => {
    setRetrying(true);
    const res = await runInv({ data: { claimId } }).catch((e) => ({ ok: false as const, message: friendlyError(e) }));
    setRetrying(false);
    if (!res.ok) toast.error(res.message);
    void refetch();
  };

  const sendEvidence = async () => {
    setSending(true);
    const { error } = await supabase.rpc("submit_claim", { _claim_id: claimId });
    setSending(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Additional evidence sent for review");
    void runInv({ data: { claimId } }).catch(() => undefined);
    void refetch();
  };

  return (
    <AppShell>
      <Link to="/claims" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> My claims
      </Link>

      {submitted && claim.status !== "draft" && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <PartyPopper className="h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold">Claim submitted successfully</p>
            <p className="text-sm text-muted-foreground">
              Your claim ID is <span className="font-mono font-semibold text-foreground">{claim.claim_number}</span>. We'll notify you at every step.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-3xl border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-semibold text-muted-foreground">{claim.claim_number}</p>
            <h1 className="text-xl font-bold">{claim.accident_type}</h1>
            <p className="text-sm text-muted-foreground">{claim.vehicle_registration} · {format(new Date(claim.accident_at), "d MMM yyyy")}</p>
          </div>
          <StatusBadge status={claim.status} />
        </div>
        <div className="mt-5"><StatusTimeline status={claim.status} /></div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
          <Bot className="h-5 w-5 shrink-0 text-info" />
          <div className="flex-1">
            <p className="font-semibold">AI investigation</p>
            <p className="text-muted-foreground">
              {claim.ai_status === "running" && "Analysing your photos and documents…"}
              {claim.ai_status === "completed" && "Analysis complete — a human investigator is reviewing your claim."}
              {claim.ai_status === "failed" && "Analysis couldn't finish. You can retry, or an investigator will start it."}
              {claim.ai_status === "not_started" && (claim.status === "submitted" ? "Queued for analysis." : "Not started.")}
            </p>
          </div>
          {claim.status === "submitted" && claim.ai_status !== "running" && (
            <Button size="sm" variant="outline" onClick={retryAi} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" /> : <RefreshCcw />} {claim.ai_status === "failed" ? "Retry" : "Start"}
            </Button>
          )}
        </div>
      </section>

      {claim.status === "approved" && (
        <section className="mt-4 rounded-3xl border border-success/30 bg-success/10 p-5">
          <p className="flex items-center gap-2 font-semibold"><BadgeCheck className="h-5 w-5 text-success" /> Claim approved</p>
          <p className="mt-2 text-sm text-muted-foreground">Approved settlement</p>
          <p className="text-3xl font-bold">{formatMoney(claim.approved_amount)}</p>
          {claim.decision_remarks && <p className="mt-3 text-sm"><span className="font-semibold">Remarks:</span> {claim.decision_remarks}</p>}
          {claim.decided_at && <p className="mt-1 text-xs text-muted-foreground">Decided {format(new Date(claim.decided_at), "d MMM yyyy, HH:mm")}</p>}
        </section>
      )}
      {claim.status === "rejected" && (
        <section className="mt-4 rounded-3xl border border-destructive/30 bg-destructive/10 p-5">
          <p className="flex items-center gap-2 font-semibold"><XCircle className="h-5 w-5 text-destructive" /> Claim not approved</p>
          <p className="mt-2 text-sm"><span className="font-semibold">Reason:</span> {claim.decision_remarks}</p>
          {claim.decided_at && <p className="mt-1 text-xs text-muted-foreground">Decided {format(new Date(claim.decided_at), "d MMM yyyy, HH:mm")}</p>}
        </section>
      )}

      {claim.status === "evidence_required" && user && (
        <section className="mt-4 space-y-3 rounded-3xl border border-warning/40 bg-warning/10 p-5">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-warning" /> Additional evidence requested</p>
          <p className="rounded-xl bg-card p-3 text-sm">{claim.evidence_request}</p>
          <p className="text-sm text-muted-foreground">Capture new photos and/or upload documents, then send them for review.</p>
          <div className="grid grid-cols-2 gap-3">
            {additional.filter((e) => e.kind === "photo").map((p) => (
              <PhotoSlot key={p.id} claimId={claim.id} userId={user.id} angle="other" evidence={p} defaults={defaults} removable onChanged={() => void refetchEvidence()} />
            ))}
            <PhotoSlot key={`add-${additional.length}`} claimId={claim.id} userId={user.id} angle="other" defaults={defaults} onChanged={() => void refetchEvidence()} />
          </div>
          <DocumentUploader claimId={claim.id} userId={user.id} kind="supporting_document" docs={additional.filter((e) => e.kind !== "photo")} onChanged={() => void refetchEvidence()} />
          <Button className="w-full" onClick={sendEvidence} disabled={sending || additional.length === 0}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />} Send additional evidence
          </Button>
        </section>
      )}

      {decisions.length > 0 && (
        <section className="mt-4 rounded-3xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold">Decision history</h2>
          <ul className="mt-3 space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="flex gap-3 text-sm">
                {d.decision === "approved" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : d.decision === "rejected" ? <XCircle className="h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                <div>
                  <p className="font-medium capitalize">{d.decision.replace("_", " ")} · <span className="text-muted-foreground">{format(new Date(d.created_at), "d MMM yyyy, HH:mm")}</span></p>
                  <p className="text-muted-foreground">{d.remarks || d.reason || d.requested_items}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-3xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Evidence</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border">
              <EvidenceImage path={p.storage_path} alt={p.angle ?? "photo"} className="aspect-[4/3] w-full" />
              <div className="p-2">
                <p className="text-xs font-semibold">{ANGLE_LABEL[(p.angle ?? "other") as keyof typeof ANGLE_LABEL]}{p.is_additional && " · additional"}</p>
                <QualityBadge status={p.quality_status} />
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-4 space-y-2">
          {docs.map((d) => (
            <li key={d.id}>
              <button onClick={() => void openEvidenceFile(d.storage_path)} className="flex w-full items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-left text-sm hover:bg-accent">
                <FileText className="h-4 w-4 text-info" />
                <span className="font-medium">{DOC_KINDS[d.kind as keyof typeof DOC_KINDS]}</span>
                <span className="truncate text-muted-foreground">{d.file_name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-5 shadow-card text-sm">
        <h2 className="mb-2 font-semibold">Claim details</h2>
        <p><span className="text-muted-foreground">Policy:</span> {claim.policy_number}</p>
        {claim.insurance_claim_number && <p><span className="text-muted-foreground">Insurance claim no.:</span> {claim.insurance_claim_number}</p>}
        <p><span className="text-muted-foreground">Location:</span> {claim.accident_location}</p>
        <p className="mt-2 text-muted-foreground">What happened</p>
        <p>{claim.accident_description}</p>
        <p className="mt-2 text-muted-foreground">Damage</p>
        <p>{claim.damage_description}</p>
      </section>
    </AppShell>
  );
}
