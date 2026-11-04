import { Badge } from "@/components/ui/badge";
import { STATUS_META, type ClaimStatus } from "@/lib/claims";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from "lucide-react";

export function StatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} className={className}>
      {status === "under_ai_analysis" && <Loader2 className="animate-spin" />}
      {meta.label}
    </Badge>
  );
}

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "ai", label: "AI analysis" },
  { key: "review", label: "Human review" },
  { key: "decision", label: "Decision" },
];

export function StatusTimeline({ status }: { status: ClaimStatus }) {
  const step = STATUS_META[status].step;
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const idx = i + 1;
        const done = step > idx || (idx === 4 && step === 4);
        const active = step === idx && idx !== 4;
        const rejected = idx === 4 && status === "rejected";
        const needsEvidence = idx === 3 && status === "evidence_required";
        return (
          <li key={s.key} className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                done && !rejected && "border-success bg-success text-success-foreground",
                rejected && "border-destructive bg-destructive text-destructive-foreground",
                active && !needsEvidence && "border-info bg-info/10 text-info",
                needsEvidence && "border-warning bg-warning/20 text-warning-foreground",
                !done && !active && !rejected && !needsEvidence && "border-border bg-card text-muted-foreground",
              )}
            >
              {rejected ? (
                <XCircle className="h-4 w-4" />
              ) : needsEvidence ? (
                <AlertTriangle className="h-4 w-4" />
              ) : done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
            </span>
            <span className={cn("text-[11px] font-medium leading-tight", done || active ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
