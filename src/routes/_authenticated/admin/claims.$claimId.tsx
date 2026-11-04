import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Bot, CheckCircle2, FileText, Loader2, Lock, RefreshCcw, Send, XCircle, AlertTriangle, History, StickyNote, ZoomIn } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate, useSession } from "@/hooks/use-auth";
import { useClaimEvidence } from "@/hooks/use-claims";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, StatusTimeline } from "@/components/claims/StatusBadge";
import { EvidenceImage } from "@/components/claims/EvidenceImage";
import { QualityBadge, ConsistencyBadge } from "@/components/claims/PhotoSlot";
import { openEvidenceFile } from "@/components/claims/DocumentUploader";
import { ImageZoom } from "@/components/admin/ImageZoom";
import { ReportView, type Report, type SystemChecks } from "@/components/admin/ReportView";
import { ANGLE_LABEL, DOC_KINDS, formatMoney, friendlyError, type Claim, type Evidence } from "@/lib/claims";
import { runInvestigation } from "@/lib/claims.functions";
import { OwnerCheckCard } from "@/components/claims/OwnerCheckCard";

export const Route = createFileRoute("/_authenticated/admin/claims/$claimId")({
  component: AdminClaim,
});

function AdminClaim() {
  const { claimId } = Route.useParams();
  const qc = useQueryClient();
  const runInv = useServerFn(runInvestigation);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("evidence");
  const [zoom, setZoom] = useState<Evidence | null>(null);

  useRealtimeInvalidate("claims", `id=eq.${claimId}`, [["admin-claim", claimId], ["ai-report", claimId], ["evidence", claimId], ["audit", claimId]]);

  const { data: claim, isLoading } = useQuery({
    queryKey: ["admin-claim", claimId],
    queryFn: async () => {
      const { data, error } = await supabase.from("claims").select("*").eq("id", claimId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: profile } = useQuery({
    queryKey: ["admin-profile", claim?.user_id],
    enabled: !!claim,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", claim!.user_id).maybeSingle()).data,
  });
  const { data: evidence = [] } = useClaimEvidence(claimId);
  const { data: report } = useQuery({
    queryKey: ["ai-report", claimId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_reports").select("*").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Auto-start analysis when a submitted claim lands here with no report yet.
  useEffect(() => {
    if (claim?.status === "submitted" && claim.ai_status === "not_started" && !running) void analyse();
  }, [claim?.status, claim?.ai_status]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyse = async () => {
    setRunning(true);
    try {
      const res = await runInv({ data: { claimId } });
      if (!res.ok) toast.error(res.message);
      else toast.success("AI investigation report generated");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["admin-claim", claimId] });
      qc.invalidateQueries({ queryKey: ["ai-report", claimId] });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" />;
  if (!claim) return <p className="text-center text-muted-foreground">Claim not found.</p>;

  const photos = evidence.filter((e) => e.kind === "photo");
  const docs = evidence.filter((e) => e.kind !== "photo");
  const checks = (report?.system_checks ?? {}) as SystemChecks;

  const onSource = (label: string) => {
    const id = Object.entries({ ...(checks.photo_labels ?? {}), ...(checks.document_labels ?? {}) }).find(([, l]) => l === label.trim())?.[0];
    const ev = evidence.find((e) => e.id === id);
    if (ev?.kind === "photo") setZoom(ev);
    else if (ev) void openEvidenceFile(ev.storage_path);
    else if (/^S\d/.test(label)) setTab("details");
  };

  const aiBusy = running || claim.ai_status === "running";

  return (
    <div className="space-y-5">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> All claims
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-5 shadow-card">
        <div>
          <p className="font-mono text-sm font-semibold text-muted-foreground">{claim.claim_number}</p>
          <h1 className="text-2xl font-bold">{claim.claimant_name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.email} · {profile?.phone} · {claim.accident_type} · {claim.vehicle_registration}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={claim.status} />
          <Button variant="outline" size="sm" onClick={analyse} disabled={aiBusy || !["submitted", "under_human_review"].includes(claim.status)}>
            {aiBusy ? <Loader2 className="animate-spin" /> : <RefreshCcw />} {report ? "Re-run AI analysis" : "Run AI analysis"}
          </Button>
        </div>
        <div className="w-full"><StatusTimeline status={claim.status} /></div>
        {claim.ai_status === "failed" && claim.ai_error && (
          <p className="w-full rounded-xl bg-destructive/10 p-3 text-sm text-destructive">AI analysis failed: {claim.ai_error}</p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="evidence">Evidence ({evidence.length})</TabsTrigger>
            <TabsTrigger value="report"><Bot className="mr-1 h-4 w-4" /> AI report</TabsTrigger>
            <TabsTrigger value="details">Claim details</TabsTrigger>
            <TabsTrigger value="notes"><Lock className="mr-1 h-3.5 w-3.5" /> Notes</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="evidence" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((p) => {
                const label = checks.photo_labels?.[p.id];
                return (
                  <div key={p.id} className="overflow-hidden rounded-2xl border bg-card shadow-card">
                    <div className="relative">
                      <EvidenceImage path={p.storage_path} alt={p.angle ?? "photo"} className="aspect-[4/3] w-full" onClick={() => setZoom(p)} />
                      <span className="absolute left-2 top-2 flex gap-1">
                        {label && <Badge>{label}</Badge>}
                        {p.is_additional && <Badge variant="warning">Additional</Badge>}
                      </span>
                      <button onClick={() => setZoom(p)} className="absolute bottom-2 right-2 rounded-lg bg-card/90 p-1.5" aria-label="Zoom"><ZoomIn className="h-4 w-4" /></button>
                    </div>
                    <div className="space-y-1.5 p-3 text-sm">
                      <p className="font-semibold">{ANGLE_LABEL[(p.angle ?? "other") as keyof typeof ANGLE_LABEL]} {p.captured_live && <span className="text-xs font-normal text-success">· live camera</span>}</p>
                      <div className="flex flex-wrap gap-1"><QualityBadge status={p.quality_status} /><ConsistencyBadge status={p.consistency_status} /></div>
                      {p.damaged_part && <p><span className="text-muted-foreground">Part:</span> {p.damaged_part}</p>}
                      <p className="text-muted-foreground">{p.damage_description}</p>
                      {p.additional_explanation && <p className="text-xs text-muted-foreground">“{p.additional_explanation}”</p>}
                      <p className="text-xs text-muted-foreground">{p.incident_date} · {p.incident_location}</p>
                      {(p.consistency_report as { mismatches?: string[] } | null)?.mismatches?.length ? (
                        <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">Intake mismatch: {(p.consistency_report as { mismatches: string[] }).mismatches.join("; ")}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <OwnerCheckCard claimId={claim.id} status={claim.owner_check_status} report={claim.owner_check_report} />
            <div className="space-y-2">
              {docs.map((d) => (
                <button key={d.id} onClick={() => void openEvidenceFile(d.storage_path)} className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-card hover:bg-accent">
                  <FileText className="h-5 w-5 text-info" />
                  {checks.document_labels?.[d.id] && <Badge>{checks.document_labels[d.id]}</Badge>}
                  <span className="font-medium">{DOC_KINDS[d.kind as keyof typeof DOC_KINDS]}</span>
                  <span className="flex-1 truncate text-muted-foreground">{d.file_name}</span>
                  {d.is_additional && <Badge variant="warning">Additional</Badge>}
                  <span className="text-xs text-muted-foreground">Open</span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="report" className="pt-3">
            {aiBusy && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-info/30 bg-info/10 p-4 text-sm">
                <Loader2 className="h-5 w-5 animate-spin text-info" /> AI is analysing photos, documents and statements. This can take a minute or two.
              </div>
            )}
            {report ? (
              <>
                <p className="mb-3 text-xs text-muted-foreground">Generated {format(new Date(report.created_at), "d MMM yyyy, HH:mm")} · {report.model}</p>
                <ReportView report={report.report as unknown as Report} checks={checks} onSource={onSource} />
              </>
            ) : (
              !aiBusy && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No AI report yet. Run the analysis to generate one.</p>
            )}
          </TabsContent>

          <TabsContent value="details" className="pt-3">
            <ClaimDetails claim={claim} />
          </TabsContent>
          <TabsContent value="notes" className="pt-3">
            <NotesPanel claimId={claimId} />
          </TabsContent>
          <TabsContent value="audit" className="pt-3">
            <AuditPanel claimId={claimId} />
          </TabsContent>
        </Tabs>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <DecisionPanel claim={claim} aiProvisional={(report?.report as unknown as Report | undefined)?.settlement?.provisional_settlement ?? null} />
        </div>
      </div>

      <ImageZoom
        open={!!zoom}
        onOpenChange={(o) => !o && setZoom(null)}
        path={zoom?.storage_path ?? null}
        title={zoom ? `${checks.photo_labels?.[zoom.id] ?? ""} ${ANGLE_LABEL[(zoom.angle ?? "other") as keyof typeof ANGLE_LABEL]}` : ""}
        description={zoom?.damage_description ?? undefined}
      />
    </div>
  );
}

function ClaimDetails({ claim }: { claim: Claim }) {
  const rows: [string, string][] = [
    ["Policy number", claim.policy_number],
    ["Insurance claim number", claim.insurance_claim_number ?? "—"],
    ["Vehicle registration", claim.vehicle_registration],
    ["Accident date & time", format(new Date(claim.accident_at), "d MMM yyyy, HH:mm")],
    ["Location", claim.accident_location],
    ["Type", claim.accident_type],
    ["Claimed amount", formatMoney(claim.claimed_amount)],
    ["Submitted", claim.submitted_at ? format(new Date(claim.submitted_at), "d MMM yyyy, HH:mm") : "—"],
  ];
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
      <div><p className="text-xs font-semibold text-muted-foreground">S1 · Accident statement</p><p className="text-sm">{claim.accident_description}</p></div>
      <div><p className="text-xs font-semibold text-muted-foreground">S2 · Damage description</p><p className="text-sm">{claim.damage_description}</p></div>
      {claim.evidence_request && <div><p className="text-xs font-semibold text-muted-foreground">Last evidence request</p><p className="text-sm">{claim.evidence_request}</p></div>}
    </div>
  );
}

function NotesPanel({ claimId }: { claimId: string }) {
  const { user } = useSession();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: notes = [], refetch } = useQuery({
    queryKey: ["notes", claimId],
    queryFn: async () => (await supabase.from("admin_notes").select("*").eq("claim_id", claimId).order("created_at", { ascending: false })).data ?? [],
  });
  const add = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("admin_notes").insert({ claim_id: claimId, note: note.trim().slice(0, 4000) });
    setSaving(false);
    if (error) return toast.error(error.message);
    setNote("");
    void refetch();
  };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Confidential — never shown to the claimant.</p>
      <Textarea rows={3} maxLength={4000} placeholder="Add an investigation note…" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" onClick={add} disabled={saving || !note.trim()}>{saving ? <Loader2 className="animate-spin" /> : <StickyNote />} Add note</Button>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-muted/60 p-3 text-sm">
            <p className="whitespace-pre-wrap">{n.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">{n.admin_id === user?.id ? "You" : `Admin ${n.admin_id.slice(0, 8)}`} · {format(new Date(n.created_at), "d MMM yyyy, HH:mm")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditPanel({ claimId }: { claimId: string }) {
  const { data: logs = [] } = useQuery({
    queryKey: ["audit", claimId],
    queryFn: async () => (await supabase.from("audit_logs").select("*").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["admin-decisions", claimId],
    queryFn: async () => (await supabase.from("admin_decisions").select("*").eq("claim_id", claimId).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="mb-2 font-semibold">Decisions</h3>
        {decisions.length === 0 ? <p className="text-sm text-muted-foreground">No decisions yet.</p> : (
          <ul className="space-y-2 text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-xl bg-muted/60 p-3">
                <p className="font-semibold capitalize">{d.decision.replace("_", " ")} {d.approved_amount != null && `· ${formatMoney(d.approved_amount)}`} {d.ai_overridden && <Badge variant="warning">AI overridden</Badge>}</p>
                <p className="text-muted-foreground">{d.remarks || d.reason || d.requested_items}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">admin {d.admin_id} · {format(new Date(d.created_at), "d MMM yyyy, HH:mm:ss")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> Audit trail</h3>
        <ul className="space-y-1.5 text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex gap-3">
              <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{format(new Date(l.created_at), "d MMM HH:mm:ss")}</span>
              <span className="font-medium">{l.action.replaceAll("_", " ")}</span>
              <span className="truncate text-muted-foreground">{l.details && Object.keys(l.details as object).length ? JSON.stringify(l.details) : ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DecisionPanel({ claim, aiProvisional }: { claim: Claim; aiProvisional: number | null }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"approved" | "rejected" | "evidence_requested">("approved");
  const [remarks, setRemarks] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState("");
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (aiProvisional != null && !amount) setAmount(String(aiProvisional));
  }, [aiProvisional]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = ["submitted", "under_human_review"].includes(claim.status);

  const save = async () => {
    if (mode === "approved") {
      if (!remarks.trim()) return toast.error("Approval remarks are required");
      if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) return toast.error("Enter a valid settlement amount");
    }
    if (mode === "rejected" && !reason.trim()) return toast.error("A rejection reason is mandatory");
    if (mode === "evidence_requested" && !requested.trim()) return toast.error("Specify the evidence you need");
    if (!confirm(`Confirm: ${mode === "approved" ? "approve" : mode === "rejected" ? "reject" : "request more evidence for"} claim ${claim.claim_number}?`)) return;
    const amt = mode === "approved" ? Number(amount) : null;
    const overridden = override || (mode === "approved" && aiProvisional != null && amt !== aiProvisional);
    setSaving(true);
    const { error } = await supabase.rpc("admin_decide", {
      _claim_id: claim.id,
      _decision: mode,
      _remarks: mode === "approved" ? remarks.trim() : "",
      _amount: amt as number,
      _reason: mode === "rejected" ? reason.trim() : "",
      _requested_items: mode === "evidence_requested" ? requested.trim() : "",
      _ai_overridden: overridden,
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Decision saved and claimant notified");
    qc.invalidateQueries({ queryKey: ["admin-claim", claim.id] });
    qc.invalidateQueries({ queryKey: ["admin-decisions", claim.id] });
    qc.invalidateQueries({ queryKey: ["audit", claim.id] });
  };

  if (!open)
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Decision</h2>
        {claim.status === "approved" && <p className="mt-2 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Approved · {formatMoney(claim.approved_amount)}</p>}
        {claim.status === "rejected" && <p className="mt-2 flex items-center gap-2 text-sm"><XCircle className="h-4 w-4 text-destructive" /> Rejected</p>}
        {claim.status === "evidence_required" && <p className="mt-2 flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-warning" /> Waiting for claimant evidence</p>}
        {claim.status === "under_ai_analysis" && <p className="mt-2 text-sm text-muted-foreground">Available once AI analysis completes.</p>}
        {claim.decision_remarks && <p className="mt-2 text-sm text-muted-foreground">{claim.decision_remarks}</p>}
      </div>
    );

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold">Your decision</h2>
        <p className="text-xs text-muted-foreground">Recorded with your admin ID, timestamp and reason.</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1">
        {([
          ["approved", "Approve"],
          ["rejected", "Reject"],
          ["evidence_requested", "Request evidence"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === k ? "bg-card shadow-card" : "text-muted-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      {mode === "approved" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="amt">Approved settlement amount *</Label>
            <Input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {aiProvisional != null && <p className="text-xs text-muted-foreground">AI provisional: {formatMoney(aiProvisional)}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rem">Approval remarks *</Label>
            <Textarea id="rem" rows={3} maxLength={4000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </>
      )}
      {mode === "rejected" && (
        <div className="grid gap-1.5">
          <Label htmlFor="rsn">Rejection reason * (shown to the claimant)</Label>
          <Textarea id="rsn" rows={4} maxLength={4000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      {mode === "evidence_requested" && (
        <div className="grid gap-1.5">
          <Label htmlFor="req">Documents or photographs needed *</Label>
          <Textarea id="req" rows={4} maxLength={4000} placeholder="e.g. A clear close-up of the rear bumper and the itemised repair invoice." value={requested} onChange={(e) => setRequested(e.target.value)} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} /> I am overriding the AI recommendation
      </label>
      <Button
        className="w-full"
        variant={mode === "approved" ? "success" : mode === "rejected" ? "destructive" : "warning"}
        onClick={save}
        disabled={saving}
      >
        {saving ? <Loader2 className="animate-spin" /> : mode === "approved" ? <CheckCircle2 /> : mode === "rejected" ? <XCircle /> : <Send />}
        {mode === "approved" ? "Approve claim" : mode === "rejected" ? "Reject claim" : "Send evidence request"}
      </Button>
    </div>
  );
}
