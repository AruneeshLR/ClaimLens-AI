import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, Loader2, LocateFixed, Send, ShieldCheck, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/layout/AuthLayout";
import { PhotoSlot, QualityBadge, ConsistencyBadge } from "@/components/claims/PhotoSlot";
import { DocumentUploader } from "@/components/claims/DocumentUploader";
import { EvidenceImage } from "@/components/claims/EvidenceImage";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useSession } from "@/hooks/use-auth";
import { useClaimEvidence } from "@/hooks/use-claims";
import { ACCIDENT_TYPES, ANGLE_LABEL, DOC_KINDS, OPTIONAL_DOC_KINDS, REQUIRED_ANGLES, REQUIRED_DOC_KINDS, documentRequirements, formatMoney, friendlyError, type Claim, type Evidence } from "@/lib/claims";
import { OwnerCheckCard, OwnerCheckBadge } from "@/components/claims/OwnerCheckCard";
import { claimDetailsSchema } from "@/lib/validation";
import { runInvestigation } from "@/lib/claims.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/claims/new")({
  validateSearch: z.object({ draft: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Submit a claim — ClaimLens AI" },
      { name: "description", content: "Submit a new vehicle insurance claim with verified live-camera evidence." },
      { property: "og:title", content: "Submit a claim — ClaimLens AI" },
      { property: "og:description", content: "Submit a new claim with verified live-camera evidence." },
    ],
  }),
  component: NewClaim,
});

const STEPS = ["Details", "Photos", "Documents", "Review"] as const;

function NewClaim() {
  const { draft } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const [step, setStep] = useState(0);

  const { data: claim, refetch: refetchClaim } = useQuery({
    queryKey: ["claim", draft],
    enabled: !!draft,
    queryFn: async () => {
      const { data, error } = await supabase.from("claims").select("*").eq("id", draft!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: evidence = [], refetch: refetchEvidence } = useClaimEvidence(draft);

  useEffect(() => {
    if (claim && claim.status !== "draft") navigate({ to: "/claims/$claimId", params: { claimId: claim.id }, replace: true });
  }, [claim, navigate]);

  useEffect(() => {
    if (draft && claim && step === 0 && evidence.length > 0) setStep(1);
  }, [draft, claim?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title="New claim">
      <Stepper step={step} onStep={(i) => draft && i <= maxStep(evidence, claim ?? null) && setStep(i)} />
      <div className="mt-5">
        {step === 0 && (
          <DetailsStep
            claim={claim ?? null}
            onSaved={(id) => {
              if (id !== draft) navigate({ to: "/claims/new", search: { draft: id }, replace: true });
              else void refetchClaim();
              setStep(1);
            }}
          />
        )}
        {step === 1 && claim && user && (
          <PhotosStep claim={claim} userId={user.id} evidence={evidence} onChanged={() => void refetchEvidence()} onBack={() => setStep(0)} onNext={() => setStep(2)} />
        )}
        {step === 2 && claim && user && (
          <DocsStep claim={claim} userId={user.id} evidence={evidence} onChanged={() => { void refetchEvidence(); void refetchClaim(); }} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}
        {step === 3 && claim && <ReviewStep claim={claim} evidence={evidence} onBack={() => setStep(2)} onEdit={setStep} />}
      </div>
    </AppShell>
  );
}

function maxStep(evidence: Evidence[], claim: Claim | null) {
  if (!claim) return 0;
  return photosComplete(evidence) ? (documentRequirements(evidence, claim.owner_check_status).complete ? 3 : 2) : 1;
}
function photosComplete(evidence: Evidence[]) {
  const photos = evidence.filter((e) => e.kind === "photo");
  return (
    REQUIRED_ANGLES.every((a) => photos.some((p) => p.angle === a && p.quality_status === "verified" && p.consistency_status !== "pending")) &&
    photos.every((p) => p.quality_status === "verified" && p.consistency_status !== "pending")
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li key={s}>
          <button type="button" onClick={() => onStep(i)} className="w-full text-left">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
            <p className={cn("mt-1.5 text-xs font-semibold", i === step ? "text-foreground" : "text-muted-foreground")}>
              {i + 1}. {s}
            </p>
          </button>
        </li>
      ))}
    </ol>
  );
}

// ---------------- Step 1: details ----------------
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function DetailsStep({ claim, onSaved }: { claim: Claim | null; onSaved: (id: string) => void }) {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const [form, setForm] = useState({
    claimant_name: "",
    policy_number: "",
    insurance_claim_number: "",
    vehicle_registration: "",
    accident_at: "",
    accident_location: "",
    accident_type: "",
    accident_description: "",
    damage_description: "",
    claimed_amount: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (claim)
      setForm({
        claimant_name: claim.claimant_name,
        policy_number: claim.policy_number,
        insurance_claim_number: claim.insurance_claim_number ?? "",
        vehicle_registration: claim.vehicle_registration,
        accident_at: toLocalInput(claim.accident_at),
        accident_location: claim.accident_location,
        accident_type: claim.accident_type,
        accident_description: claim.accident_description,
        damage_description: claim.damage_description,
        claimed_amount: claim.claimed_amount != null ? String(claim.claimed_amount) : "",
      });
    else if (profile) setForm((f) => ({ ...f, claimant_name: f.claimant_name || profile.full_name }));
  }, [claim?.id, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location is not available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set("accident_location")(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    const parsed = claimDetailsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setSaving(true);
    const payload = {
      ...parsed.data,
      accident_at: new Date(parsed.data.accident_at).toISOString(),
      claimed_amount: parsed.data.claimed_amount ? Number(parsed.data.claimed_amount) : null,
    };
    try {
      if (claim) {
        const { error } = await supabase.from("claims").update(payload).eq("id", claim.id);
        if (error) throw error;
        onSaved(claim.id);
      } else {
        const { data, error } = await supabase.from("claims").insert(payload).select("id").single();
        if (error) throw error;
        onSaved(data.id);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (k: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={(e) => set(k)(e.target.value)} {...props} />
      <FieldError msg={errors[k]} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Claimant & vehicle</h2>
        {field("claimant_name", "Claimant name", { maxLength: 120, autoComplete: "name" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("policy_number", "Policy number", { maxLength: 60 })}
          {field("vehicle_registration", "Vehicle registration number", { maxLength: 30, className: "uppercase" })}
        </div>
        {field("insurance_claim_number", "Insurance claim number (from your insurer)", { maxLength: 60, placeholder: "e.g. CLM/2026/123456" })}
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Accident</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("accident_at", "Date & time", { type: "datetime-local", max: toLocalInput(new Date().toISOString()) })}
          <div className="grid gap-1.5">
            <Label>Type of accident</Label>
            <Select value={form.accident_type} onValueChange={set("accident_type")}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                {ACCIDENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError msg={errors.accident_type} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="accident_location">Location</Label>
          <div className="flex gap-2">
            <Input id="accident_location" maxLength={300} value={form.accident_location} onChange={(e) => set("accident_location")(e.target.value)} placeholder="Street, city" />
            <Button type="button" variant="outline" size="icon" onClick={locate} aria-label="Use my location" disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            </Button>
          </div>
          <FieldError msg={errors.accident_location} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="accident_description">What happened?</Label>
          <Textarea id="accident_description" rows={4} maxLength={4000} value={form.accident_description} onChange={(e) => set("accident_description")(e.target.value)} />
          <FieldError msg={errors.accident_description} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="damage_description">Overall damage description</Label>
          <Textarea id="damage_description" rows={3} maxLength={4000} value={form.damage_description} onChange={(e) => set("damage_description")(e.target.value)} />
          <FieldError msg={errors.damage_description} />
        </div>
        {field("claimed_amount", "Estimated claim amount (optional)", { inputMode: "decimal", placeholder: "e.g. 45000" })}
      </div>
      <Button className="w-full" size="lg" onClick={save} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />} Save & capture photos <ArrowRight />
      </Button>
    </div>
  );
}

// ---------------- Step 2: photos ----------------
function PhotosStep({
  claim,
  userId,
  evidence,
  onChanged,
  onBack,
  onNext,
}: {
  claim: Claim;
  userId: string;
  evidence: Evidence[];
  onChanged: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const photos = evidence.filter((e) => e.kind === "photo");
  const extras = photos.filter((p) => p.angle === "other");
  const defaults = { incident_date: claim.accident_at.slice(0, 10), incident_location: claim.accident_location };
  const complete = photosComplete(evidence);
  const verifiedCount = REQUIRED_ANGLES.filter((a) => photos.some((p) => p.angle === a && p.quality_status === "verified" && p.consistency_status !== "pending")).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Live camera evidence</p>
          <span className="text-sm font-semibold text-info">{verifiedCount}/5 verified</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture each required shot with your camera. After each photo, describe it and run the two-step verification.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {REQUIRED_ANGLES.map((a) => (
          <PhotoSlot key={a} claimId={claim.id} userId={userId} angle={a} evidence={photos.find((p) => p.angle === a)} defaults={defaults} required onChanged={onChanged} />
        ))}
        {extras.map((p) => (
          <PhotoSlot key={p.id} claimId={claim.id} userId={userId} angle="other" evidence={p} defaults={defaults} removable onChanged={onChanged} />
        ))}
        <PhotoSlot
          claimId={claim.id}
          userId={userId}
          angle="opposite_vehicle"
          evidence={photos.find((p) => p.angle === "opposite_vehicle")}
          defaults={defaults}
          removable
          onChanged={onChanged}
        />
        <PhotoSlot key={`new-${extras.length}`} claimId={claim.id} userId={userId} angle="other" defaults={defaults} onChanged={onChanged} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft /> Back</Button>
        <Button className="flex-1" onClick={onNext} disabled={!complete}>
          {complete ? <>Continue to documents <ArrowRight /></> : "Verify all required photos to continue"}
        </Button>
      </div>
    </div>
  );
}

// ---------------- Step 3: documents ----------------
function DocsStep({ claim, userId, evidence, onChanged, onBack, onNext }: { claim: Claim; userId: string; evidence: Evidence[]; onChanged: () => void; onBack: () => void; onNext: () => void }) {
  const docs = (k: string) => evidence.filter((e) => e.kind === k);
  const req = documentRequirements(evidence, claim.owner_check_status);
  const hasRc = docs("rc_book").length > 0;
  const hasPolicy = docs("policy_document").length > 0;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Documents</p>
          <span className="text-sm font-semibold text-info">{REQUIRED_DOC_KINDS.length - req.missing.length}/{REQUIRED_DOC_KINDS.length} required</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Upload clear copies. Your files are stored privately and only shared with the investigator.</p>
      </div>
      {REQUIRED_DOC_KINDS.map((k) => (
        <div key={k} className="space-y-3">
          <DocumentUploader claimId={claim.id} userId={userId} kind={k} docs={docs(k)} required onChanged={onChanged} />
          {k === "rc_book" && (
            <OwnerCheckCard
              claimId={claim.id}
              status={claim.owner_check_status}
              report={claim.owner_check_report}
              canRun
              blockedReason={!hasRc || !hasPolicy ? "Upload the insurance policy and RC book first" : undefined}
              onChanged={onChanged}
            />
          )}
        </div>
      ))}
      {OPTIONAL_DOC_KINDS.map((k) => (
        <DocumentUploader key={k} claimId={claim.id} userId={userId} kind={k} docs={docs(k)} onChanged={onChanged} />
      ))}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft /> Back</Button>
        <Button className="flex-1" onClick={onNext} disabled={!req.complete}>
          {req.complete ? <>Review claim <ArrowRight /></> : req.missing.length ? `Upload: ${req.missing.map((k) => DOC_KINDS[k]).join(", ")}` : "Run the owner name check to continue"}
        </Button>
      </div>
    </div>
  );
}

// ---------------- Step 4: review & submit ----------------
function ReviewStep({ claim, evidence, onBack, onEdit }: { claim: Claim; evidence: Evidence[]; onBack: () => void; onEdit: (s: number) => void }) {
  const navigate = useNavigate();
  const runInv = useServerFn(runInvestigation);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const photos = evidence.filter((e) => e.kind === "photo");
  const docs = evidence.filter((e) => e.kind !== "photo");

  const checklist = useMemo(
    () => [
      { ok: true, label: "Claim details completed" },
      ...REQUIRED_ANGLES.map((a) => ({
        ok: photos.some((p) => p.angle === a && p.quality_status === "verified" && p.consistency_status !== "pending"),
        label: `${ANGLE_LABEL[a]} verified`,
      })),
      { ok: !!claim.insurance_claim_number, label: "Insurance claim number entered" },
      ...REQUIRED_DOC_KINDS.map((k) => ({ ok: docs.some((d) => d.kind === k), label: `${DOC_KINDS[k]} uploaded` })),
      { ok: claim.owner_check_status !== "pending", label: "RC book & insurance owner name checked" },
      { ok: docs.some((d) => d.kind === "fir_document"), label: "CSR / FIR copy uploaded (optional)", optional: true },
      { ok: docs.some((d) => d.kind === "repair_estimate"), label: "Repair estimate uploaded (recommended)", optional: true },
    ],
    [photos, docs, claim.insurance_claim_number, claim.owner_check_status],
  );
  const ready = checklist.every((c) => c.ok || ("optional" in c && c.optional));

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: number, error } = await supabase.rpc("submit_claim", { _claim_id: claim.id });
      if (error) throw error;
      toast.success(`Claim ${number} submitted successfully`);
      // Kick off AI investigation; status updates arrive in real time.
      void runInv({ data: { claimId: claim.id } }).catch(() => undefined);
      navigate({ to: "/claims/$claimId", params: { claimId: claim.id }, search: { submitted: 1 }, replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const discard = async () => {
    if (!confirm("Discard this draft claim and all its evidence?")) return;
    setDiscarding(true);
    const paths = evidence.map((e) => e.storage_path);
    if (paths.length) await supabase.storage.from("claim-files").remove(paths);
    const { error } = await supabase.from("claims").delete().eq("id", claim.id);
    setDiscarding(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/claims", replace: true });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Claim summary</h2>
          <Button variant="link" size="sm" onClick={() => onEdit(0)}>Edit</Button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Item k="Claimant" v={claim.claimant_name} />
          <Item k="Policy no." v={claim.policy_number} />
          <Item k="Insurer claim no." v={claim.insurance_claim_number ?? "—"} />
          <Item k="Vehicle" v={claim.vehicle_registration} />
          <Item k="Accident" v={format(new Date(claim.accident_at), "d MMM yyyy, HH:mm")} />
          <Item k="Type" v={claim.accident_type} />
          <Item k="Claimed" v={formatMoney(claim.claimed_amount)} />
          <Item k="Location" v={claim.accident_location} full />
          <Item k="What happened" v={claim.accident_description} full />
          <Item k="Damage" v={claim.damage_description} full />
        </dl>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Photographs ({photos.length})</h2>
          <Button variant="link" size="sm" onClick={() => onEdit(1)}>Edit</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border">
              <EvidenceImage path={p.storage_path} alt={p.angle ?? "photo"} className="aspect-[4/3] w-full" />
              <div className="space-y-1 p-2">
                <p className="text-xs font-semibold">{ANGLE_LABEL[(p.angle ?? "other") as keyof typeof ANGLE_LABEL]}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{p.damage_description}</p>
                <div className="flex flex-wrap gap-1"><QualityBadge status={p.quality_status} /><ConsistencyBadge status={p.consistency_status} /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Documents ({docs.length})</h2>
          <Button variant="link" size="sm" onClick={() => onEdit(2)}>Edit</Button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">RC vs insurance owner:</span> <OwnerCheckBadge status={claim.owner_check_status} />
        </div>
        <ul className="mt-2 space-y-1.5 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2"><FileText className="h-4 w-4 text-info" /> <span className="font-medium">{DOC_KINDS[d.kind as keyof typeof DOC_KINDS]}:</span> <span className="truncate text-muted-foreground">{d.file_name}</span></li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="mb-2 font-semibold">Evidence checklist</h2>
        <ul className="space-y-1.5 text-sm">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-info/10 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-info" />
          By submitting you confirm the information is accurate. AI will prepare an investigation report, and a human investigator will make the final decision.
        </p>
      </section>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft /> Back</Button>
        <Button className="flex-1" size="lg" onClick={submit} disabled={!ready || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Send />} Submit claim
        </Button>
      </div>
      <Button variant="ghost" className="w-full text-destructive" onClick={discard} disabled={discarding}>
        <Trash2 /> Discard draft
      </Button>
    </div>
  );
}

function Item({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
