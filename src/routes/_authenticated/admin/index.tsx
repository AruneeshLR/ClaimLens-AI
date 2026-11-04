import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Inbox, Clock, Bot, UserSearch, CheckCircle2, XCircle, Files, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/claims/StatusBadge";
import { STATUS_META, type ClaimStatus } from "@/lib/claims";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  useRealtimeInvalidate("claims", undefined, [["admin-claims"]]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ClaimStatus>("all");

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["admin-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("id, claim_number, claimant_name, user_id, accident_type, status, submitted_at, created_at, ai_status, vehicle_registration")
        .neq("status", "draft")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const userIds = useMemo(() => Array.from(new Set(claims.map((c) => c.user_id))), [claims]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      return data ?? [];
    },
  });

  const count = (s: ClaimStatus) => claims.filter((c) => c.status === s).length;
  const stats = [
    { label: "Total received", value: claims.length, icon: Files, tone: "bg-primary text-primary-foreground" },
    { label: "Pending", value: count("submitted"), icon: Clock, tone: "bg-info/15 text-info", filter: "submitted" as const },
    { label: "Under AI analysis", value: count("under_ai_analysis"), icon: Bot, tone: "bg-secondary text-secondary-foreground", filter: "under_ai_analysis" as const },
    { label: "Awaiting review", value: count("under_human_review"), icon: UserSearch, tone: "bg-warning/20 text-warning-foreground", filter: "under_human_review" as const },
    { label: "Evidence requested", value: count("evidence_required"), icon: AlertTriangle, tone: "bg-warning/20 text-warning-foreground", filter: "evidence_required" as const },
    { label: "Approved", value: count("approved"), icon: CheckCircle2, tone: "bg-success/15 text-success", filter: "approved" as const },
    { label: "Rejected", value: count("rejected"), icon: XCircle, tone: "bg-destructive/12 text-destructive", filter: "rejected" as const },
  ];

  const term = q.trim().toLowerCase();
  const rows = claims.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (!term) return true;
    const p = profiles.find((x) => x.id === c.user_id);
    return [c.claim_number, c.claimant_name, c.accident_type, c.vehicle_registration, p?.full_name, p?.email].some((v) => v?.toLowerCase().includes(term));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Claims overview</h1>
        <p className="text-sm text-muted-foreground">AI prepares the investigation. You make every decision.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={() => setStatus(s.filter ?? "all")}
            className={cn("rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-ring/40", (s.filter ?? "all") === status && "ring-2 ring-ring")}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", s.tone)}>
              <s.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card shadow-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search claim ID, name, vehicle, type…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="sm:w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_META) as ClaimStatus[]).filter((s) => s !== "draft").map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">No claims match.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Submitted</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const p = profiles.find((x) => x.id === c.user_id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-semibold">{c.claim_number}</TableCell>
                    <TableCell>
                      <p className="font-medium">{p?.full_name || c.claimant_name}</p>
                      <p className="text-xs text-muted-foreground">{p?.email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{c.submitted_at ? format(new Date(c.submitted_at), "d MMM yyyy, HH:mm") : "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{c.accident_type}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/claims/$claimId" params={{ claimId: c.id }}>View details</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
