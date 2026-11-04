import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCcw, Trash2, ShieldCheck, Sparkles, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CameraCapture } from "./CameraCapture";
import { EvidenceImage } from "./EvidenceImage";
import { supabase } from "@/integrations/supabase/client";
import { ANGLE_LABEL, friendlyError, type Angle, type Evidence } from "@/lib/claims";
import { addPhotoEvidence, downloadBlob, removeEvidence } from "@/lib/evidence-client";
import { analyzeImage } from "@/lib/image-metrics";
import { checkPhotoQuality, checkDescriptionConsistency } from "@/lib/claims.functions";
import { cn } from "@/lib/utils";

type QualityReport = {
  checks: { key: string; label: string; passed: boolean; detail: string }[];
  issues: string[];
  summary: string;
};
type ConsistencyReport = {
  verdict: string;
  observed_damage: string;
  matches: string[];
  mismatches: string[];
  uncertain: string[];
  suggestion: string;
};

const HINTS: Record<Angle, string> = {
  front: "Stand 2–3 m in front of the vehicle. Include the full bumper and number plate.",
  rear: "Stand 2–3 m behind the vehicle. Include the full rear and number plate.",
  left: "Capture the full left side from front wheel to rear wheel.",
  right: "Capture the full right side from front wheel to rear wheel.",
  closeup: "Move close to the damaged area. Fill the frame with the damage.",
  opposite_vehicle: "Photograph the damage on the other vehicle involved. Include its number plate if possible.",
  other: "Capture any additional damage or context.",
};

export function QualityBadge({ status }: { status: string }) {
  if (status === "verified") return <Badge variant="success"><CheckCircle2 /> Verified</Badge>;
  if (status === "failed") return <Badge variant="destructive"><XCircle /> Verification failed</Badge>;
  if (status === "retake_required") return <Badge variant="warning"><RefreshCcw /> Retake required</Badge>;
  return <Badge variant="muted">Quality pending</Badge>;
}
export function ConsistencyBadge({ status }: { status: string }) {
  if (status === "consistent") return <Badge variant="success"><CheckCircle2 /> Description consistent</Badge>;
  if (status === "mismatch") return <Badge variant="destructive"><AlertTriangle /> Mismatch found</Badge>;
  if (status === "uncertain") return <Badge variant="warning"><AlertTriangle /> Partly uncertain</Badge>;
  return <Badge variant="muted">Description check pending</Badge>;
}

export function PhotoSlot({
  claimId,
  userId,
  angle,
  evidence,
  defaults,
  required,
  onChanged,
  removable,
}: {
  claimId: string;
  userId: string;
  angle: Angle;
  evidence?: Evidence;
  defaults: { incident_date: string | null; incident_location: string | null };
  required?: boolean;
  removable?: boolean;
  onChanged: () => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [localBlob, setLocalBlob] = useState<Blob | null>(null);

  const onCaptured = async (blob: Blob) => {
    try {
      if (evidence) await removeEvidence(evidence);
      await addPhotoEvidence({ userId, claimId, angle, blob, defaults });
      setLocalBlob(blob);
      setCameraOpen(false);
      onChanged();
      setDialogOpen(true);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const done = evidence && evidence.quality_status === "verified" && evidence.consistency_status !== "pending";

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-2xl border bg-card shadow-card transition",
          done ? "border-success/40" : evidence ? "border-warning/50" : "border-dashed",
        )}
      >
        {evidence ? (
          <button type="button" onClick={() => setDialogOpen(true)} className="block w-full text-left">
            <EvidenceImage path={evidence.storage_path} alt={ANGLE_LABEL[angle]} className="aspect-[4/3] w-full" />
            <div className="space-y-1.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{ANGLE_LABEL[angle]}</p>
                {done ? <ShieldCheck className="h-4 w-4 text-success" /> : <ClipboardCheck className="h-4 w-4 text-warning" />}
              </div>
              <div className="flex flex-wrap gap-1">
                <QualityBadge status={evidence.quality_status} />
                {evidence.quality_status === "verified" && <ConsistencyBadge status={evidence.consistency_status} />}
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 p-3 text-center hover:bg-accent/40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Camera className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold">{ANGLE_LABEL[angle]}</span>
            <span className="text-xs text-muted-foreground">{required ? "Required · tap to open camera" : "Optional"}</span>
          </button>
        )}
      </div>

      <CameraCapture
        open={cameraOpen}
        title={ANGLE_LABEL[angle]}
        hint={HINTS[angle]}
        onClose={() => setCameraOpen(false)}
        onConfirm={onCaptured}
      />

      {evidence && (
        <VerifyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          evidence={evidence}
          angle={angle}
          localBlob={localBlob}
          removable={removable}
          onChanged={onChanged}
          onRetake={() => {
            setDialogOpen(false);
            setCameraOpen(true);
          }}
          onRemoved={() => {
            setDialogOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function VerifyDialog({
  open,
  onOpenChange,
  evidence,
  angle,
  localBlob,
  removable,
  onChanged,
  onRetake,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  evidence: Evidence;
  angle: Angle;
  localBlob: Blob | null;
  removable?: boolean;
  onChanged: () => void;
  onRetake: () => void;
  onRemoved: () => void;
}) {
  const qualityFn = useServerFn(checkPhotoQuality);
  const consistencyFn = useServerFn(checkDescriptionConsistency);
  const [form, setForm] = useState({
    damaged_part: evidence.damaged_part ?? "",
    damage_description: evidence.damage_description ?? "",
    incident_date: evidence.incident_date ?? "",
    incident_location: evidence.incident_location ?? "",
    additional_explanation: evidence.additional_explanation ?? "",
  });
  const [stage, setStage] = useState<"idle" | "saving" | "quality" | "consistency">("idle");

  useEffect(() => {
    setForm({
      damaged_part: evidence.damaged_part ?? "",
      damage_description: evidence.damage_description ?? "",
      incident_date: evidence.incident_date ?? "",
      incident_location: evidence.incident_location ?? "",
      additional_explanation: evidence.additional_explanation ?? "",
    });
  }, [evidence.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quality = evidence.quality_report as QualityReport | null;
  const consistency = evidence.consistency_report as ConsistencyReport | null;
  const bothDone = evidence.quality_status === "verified" && evidence.consistency_status !== "pending";

  const run = async () => {
    if (form.damage_description.trim().length < 3) {
      toast.error("Describe the damage visible in this photo (or write 'No visible damage').");
      return;
    }
    try {
      setStage("saving");
      const { error } = await supabase
        .from("evidence")
        .update({
          damaged_part: form.damaged_part.trim() || null,
          damage_description: form.damage_description.trim(),
          incident_date: form.incident_date || null,
          incident_location: form.incident_location.trim() || null,
          additional_explanation: form.additional_explanation.trim() || null,
        })
        .eq("id", evidence.id);
      if (error) throw error;

      let qStatus = evidence.quality_status;
      if (qStatus !== "verified") {
        setStage("quality");
        const blob = localBlob ?? (await downloadBlob(evidence.storage_path));
        const metrics = await analyzeImage(blob);
        const res = await qualityFn({ data: { evidenceId: evidence.id, metrics } });
        qStatus = res.status;
        onChanged();
        if (res.status !== "verified") {
          toast.warning(res.status === "failed" ? "Verification failed — please retake this photo." : "Retake required — see the reasons below.");
          return;
        }
      }
      setStage("consistency");
      const c = await consistencyFn({ data: { evidenceId: evidence.id } });
      onChanged();
      if (c.verdict === "consistent") toast.success("Photo and description verified");
      else toast.warning("Please review the AI findings below");
    } catch (e) {
      toast.error(friendlyError(e));
      onChanged();
    } finally {
      setStage("idle");
    }
  };

  const busy = stage !== "idle";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{ANGLE_LABEL[angle]}</DialogTitle>
          <DialogDescription>Describe what this photo shows, then run the two-step verification.</DialogDescription>
        </DialogHeader>

        <EvidenceImage path={evidence.storage_path} alt={ANGLE_LABEL[angle]} className="aspect-[4/3] w-full rounded-xl" />

        {bothDone && (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
              <div>
                <p className="font-semibold">Evidence verified</p>
                <p className="text-sm text-muted-foreground">
                  Both checks are complete. {evidence.consistency_status !== "consistent" && "You can still edit the description or retake to resolve the AI notes."}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="part">Damaged vehicle part</Label>
            <Input id="part" maxLength={120} placeholder="e.g. Front bumper, left headlight" value={form.damaged_part} onChange={(e) => setForm({ ...form, damaged_part: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desc">Damage description *</Label>
            <Textarea id="desc" maxLength={2000} rows={3} placeholder="What damage is visible in this photo?" value={form.damage_description} onChange={(e) => setForm({ ...form, damage_description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="date">Incident date</Label>
              <Input id="date" type="date" value={form.incident_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loc">Incident location</Label>
              <Input id="loc" maxLength={300} value={form.incident_location} onChange={(e) => setForm({ ...form, incident_location: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="extra">Additional explanation</Label>
            <Textarea id="extra" maxLength={2000} rows={2} value={form.additional_explanation} onChange={(e) => setForm({ ...form, additional_explanation: e.target.value })} />
          </div>
        </div>

        {/* Step 1 */}
        <section className="rounded-2xl border bg-muted/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Step 1 · Image quality</p>
            {stage === "quality" ? <Badge variant="info"><Loader2 className="animate-spin" /> Checking…</Badge> : <QualityBadge status={evidence.quality_status} />}
          </div>
          {quality ? (
            <>
              <ul className="grid gap-1.5">
                {quality.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <span><span className="font-medium">{c.label}:</span> <span className="text-muted-foreground">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
              {evidence.quality_status !== "verified" && quality.issues.length > 0 && (
                <div className="mt-3 rounded-xl bg-warning/15 p-3 text-sm">
                  <p className="mb-1 font-medium">Why a new photo is needed</p>
                  <ul className="list-disc space-y-0.5 pl-5">{quality.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Checks clarity, brightness, vehicle visibility, damaged area and file integrity.</p>
          )}
        </section>

        {/* Step 2 */}
        <section className="rounded-2xl border bg-muted/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-info" /> Step 2 · Description check</p>
            {stage === "consistency" ? <Badge variant="info"><Loader2 className="animate-spin" /> Comparing…</Badge> : <ConsistencyBadge status={evidence.consistency_status} />}
          </div>
          {consistency ? (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">AI sees:</span> <span className="text-muted-foreground">{consistency.observed_damage}</span></p>
              {consistency.matches.length > 0 && <FindingList title="Matches your description" items={consistency.matches} tone="success" />}
              {consistency.mismatches.length > 0 && <FindingList title="Doesn't match" items={consistency.mismatches} tone="destructive" />}
              {consistency.uncertain.length > 0 && <FindingList title="Can't confirm from this photo" items={consistency.uncertain} tone="warning" />}
              {consistency.suggestion && <p className="rounded-xl bg-info/10 p-3">{consistency.suggestion}</p>}
              <p className="text-xs text-muted-foreground">This check only compares the photo with your words. It is not a judgement about your claim.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">AI compares your written description with what is visible in the photo.</p>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {evidence.quality_status === "verified" ? (evidence.consistency_status === "pending" ? "Run description check" : "Save & re-check description") : "Save & verify"}
          </Button>
          <Button variant="outline" onClick={onRetake} disabled={busy}>
            <RefreshCcw /> Retake
          </Button>
          {removable && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                try {
                  await removeEvidence(evidence);
                  onRemoved();
                } catch (e) {
                  toast.error(friendlyError(e));
                }
              }}
            >
              <Trash2 /> Remove
            </Button>
          )}
          {bothDone && (
            <Button variant="success" className="w-full" onClick={() => onOpenChange(false)} disabled={busy}>
              <CheckCircle2 /> Confirm & continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FindingList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "destructive" | "warning" }) {
  return (
    <div>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-warning-foreground")}>{title}</p>
      <ul className="list-disc pl-5 text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
