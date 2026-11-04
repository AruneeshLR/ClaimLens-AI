import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Eye, MessageSquareQuote, Brain, HelpCircle, SearchX, AlertTriangle, Lightbulb, ListChecks, Scale, Calculator, Gauge, Image as ImageIcon, FileText, GitCompare, Siren, ShieldAlert } from "lucide-react";
import { formatMoney } from "@/lib/claims";

export type Finding = {
  finding: string;
  category: "observed_fact" | "claimant_statement" | "ai_interpretation" | "unverified_assumption" | "missing_information";
  sources: string[];
  confidence: "low" | "medium" | "high";
};
export type Report = {
  claim_summary: string;
  image_analysis: Finding[];
  damaged_components: string[];
  document_analysis: Finding[];
  policy_coverage: { coverage_conditions: string[]; exclusions: string[]; deductible: string | null; policy_limit: string | null; assessment: string; sources: string[] };
  consistency_findings: Finding[];
  inconsistencies: Finding[];
  anomalies: Finding[];
  alternative_explanations: string[];
  missing_evidence: string[];
  recommended_actions: string[];
  settlement: { sufficient_information: boolean; estimated_repair_cost: number | null; deductible_amount: number | null; provisional_settlement: number | null; currency: string | null; rationale: string };
  overall_confidence: "low" | "medium" | "high";
  uncertainty_explanation: string;
};
export type SystemChecks = {
  duplicate_within_claim: string[];
  duplicate_across_claims: string[];
  prior_claims_by_claimant: { claim_number: string; status: string; accident_at: string }[];
  same_vehicle_claims_by_other_accounts: number;
  missing_items: string[];
  skipped_files: string[];
  photo_labels: Record<string, string>;
  document_labels: Record<string, string>;
};

const CATEGORY: Record<Finding["category"], { label: string; icon: typeof Eye; variant: "success" | "info" | "secondary" | "warning" | "muted" }> = {
  observed_fact: { label: "Observed fact", icon: Eye, variant: "success" },
  claimant_statement: { label: "Claimant statement", icon: MessageSquareQuote, variant: "info" },
  ai_interpretation: { label: "AI interpretation", icon: Brain, variant: "secondary" },
  unverified_assumption: { label: "Unverified assumption", icon: HelpCircle, variant: "warning" },
  missing_information: { label: "Missing information", icon: SearchX, variant: "muted" },
};

function Sources({ sources, onSource }: { sources: string[]; onSource?: (s: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <button key={s} type="button" onClick={() => onSource?.(s)} className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold hover:bg-accent">
          {s}
        </button>
      ))}
    </span>
  );
}

function FindingList({ items, onSource }: { items: Finding[]; onSource?: (s: string) => void }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">None identified.</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((f, i) => {
        const c = CATEGORY[f.category] ?? CATEGORY.ai_interpretation;
        return (
          <li key={i} className="rounded-xl border bg-card p-3">
            <p className="text-sm">{f.finding}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={c.variant}><c.icon /> {c.label}</Badge>
              <Badge variant="outline">Confidence: {f.confidence}</Badge>
              <Sources sources={f.sources} onSource={onSource} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof Eye; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-muted/30 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary font-mono text-[11px] text-primary-foreground">{n}</span>
        <Icon className="h-4 w-4 text-info" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">None.</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export function ReportView({ report, checks, onSource }: { report: Report; checks: SystemChecks; onSource?: (s: string) => void }) {
  const s = report.settlement;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.values(CATEGORY).map((c) => (
          <Badge key={c.label} variant={c.variant}><c.icon /> {c.label}</Badge>
        ))}
      </div>

      <Section n={1} title="Claim summary" icon={ListChecks}><p className="text-sm">{report.claim_summary}</p></Section>

      <Section n={2} title="Image analysis" icon={ImageIcon}>
        {report.damaged_components?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">{report.damaged_components.map((d) => <Badge key={d} variant="secondary">{d}</Badge>)}</div>
        )}
        <FindingList items={report.image_analysis} onSource={onSource} />
      </Section>

      <Section n={3} title="Document analysis" icon={FileText}><FindingList items={report.document_analysis} onSource={onSource} /></Section>

      <Section n={4} title="Policy coverage assessment" icon={Scale}>
        <p className="text-sm">{report.policy_coverage.assessment}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Coverage conditions</p><Bullets items={report.policy_coverage.coverage_conditions} /></div>
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Exclusions</p><Bullets items={report.policy_coverage.exclusions} /></div>
          <p className="text-sm"><span className="text-muted-foreground">Deductible:</span> {report.policy_coverage.deductible ?? "Not found"}</p>
          <p className="text-sm"><span className="text-muted-foreground">Policy limit:</span> {report.policy_coverage.policy_limit ?? "Not found"}</p>
        </div>
        <div className="mt-2"><Sources sources={report.policy_coverage.sources} onSource={onSource} /></div>
      </Section>

      <Section n={5} title="Evidence consistency findings" icon={GitCompare}><FindingList items={report.consistency_findings} onSource={onSource} /></Section>

      <Section n={6} title="Identified inconsistencies & anomalies" icon={AlertTriangle}>
        <FindingList items={[...(report.inconsistencies ?? []), ...(report.anomalies ?? [])]} onSource={onSource} />
        <div className="mt-3 rounded-xl border border-info/30 bg-info/10 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-semibold"><ShieldAlert className="h-3.5 w-3.5" /> Platform checks [SYS]</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Duplicate files in this claim: {checks.duplicate_within_claim?.length ? checks.duplicate_within_claim.join("; ") : "none"}</li>
            <li>Files also in other claims: {checks.duplicate_across_claims?.length ? checks.duplicate_across_claims.join("; ") : "none"}</li>
            <li>Prior claims by this claimant: {checks.prior_claims_by_claimant?.length ?? 0}</li>
            <li>Same vehicle claimed by other accounts: {checks.same_vehicle_claims_by_other_accounts ?? 0}</li>
            {checks.skipped_files?.length > 0 && <li>Not analysed: {checks.skipped_files.join("; ")}</li>}
          </ul>
          <p className="mt-2 text-muted-foreground">An anomaly is an investigative signal, not proof of fraud.</p>
        </div>
      </Section>

      <Section n={7} title="Possible alternative explanations" icon={Lightbulb}><Bullets items={report.alternative_explanations} /></Section>
      <Section n={8} title="Missing evidence" icon={SearchX}><Bullets items={report.missing_evidence} /></Section>
      <Section n={9} title="Recommended investigation actions" icon={Siren}><Bullets items={report.recommended_actions} /></Section>

      <Section n={10} title="Provisional settlement analysis" icon={Calculator}>
        {s.sufficient_information ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-card p-3"><p className="text-xs text-muted-foreground">Repair estimate</p><p className="font-bold">{formatMoney(s.estimated_repair_cost)}</p></div>
            <div className="rounded-xl bg-card p-3"><p className="text-xs text-muted-foreground">Deductible</p><p className="font-bold">{formatMoney(s.deductible_amount)}</p></div>
            <div className="rounded-xl bg-primary p-3 text-primary-foreground"><p className="text-xs opacity-80">Provisional</p><p className="font-bold">{formatMoney(s.provisional_settlement)}</p></div>
          </div>
        ) : (
          <p className="text-sm font-medium text-warning-foreground">Insufficient information for a provisional settlement.</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{s.rationale}</p>
      </Section>

      <Section n={11} title="AI confidence & uncertainty" icon={Gauge}>
        <Badge variant={report.overall_confidence === "high" ? "success" : report.overall_confidence === "medium" ? "warning" : "destructive"}>
          Overall confidence: {report.overall_confidence}
        </Badge>
        <p className="mt-2 text-sm">{report.uncertainty_explanation}</p>
      </Section>

      <Section n={12} title="Source references" icon={FileText}>
        <p className="mb-2 text-xs text-muted-foreground">Click a source tag anywhere in the report to open it.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">S1 — Accident statement</Badge>
          <Badge variant="outline">S2 — Damage description</Badge>
          <Badge variant="outline">SYS — Platform checks</Badge>
          {Object.values(checks.photo_labels ?? {}).map((l) => <Badge key={l} variant="outline">{l} — Photo</Badge>)}
          {Object.values(checks.document_labels ?? {}).map((l) => <Badge key={l} variant="outline">{l} — Document</Badge>)}
        </div>
      </Section>
      <p className="text-center text-xs text-muted-foreground">AI output is advisory. It never approves or rejects a claim.</p>
    </div>
  );
}
