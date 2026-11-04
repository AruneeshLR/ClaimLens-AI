import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, FieldError } from "@/components/layout/AuthLayout";
import { signInSchema } from "@/lib/validation";
import { PasswordInput } from "@/components/PasswordInput";

export const Route = createFileRoute("/admin-login")({
  validateSearch: z.object({ denied: z.coerce.number().optional() }),
  head: () => ({
    meta: [
      { title: "Investigator login — ClaimLens AI" },
      { name: "description", content: "Restricted sign-in for authorised ClaimLens AI claim investigators." },
      { property: "og:title", content: "Investigator login — ClaimLens AI" },
      { property: "og:description", content: "Restricted access for authorised claim investigators." },
    ],
  }),
  component: AdminLogin,
});

const LOCK_KEY = "cl-admin-lock";

function AdminLogin() {
  const navigate = useNavigate();
  const { denied } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (raw) setLockedUntil(JSON.parse(raw).until ?? 0);
    const t = setInterval(() => tick((n) => n + 1), 1000);
    if (denied) toast.error("That account is not authorised for the admin console.");
    return () => clearInterval(t);
  }, [denied]);

  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  const recordFailure = () => {
    const raw = JSON.parse(sessionStorage.getItem(LOCK_KEY) ?? "{}");
    const fails = (raw.fails ?? 0) + 1;
    const until = fails >= 5 ? Date.now() + 60_000 : 0;
    sessionStorage.setItem(LOCK_KEY, JSON.stringify({ fails: fails >= 5 ? 0 : fails, until }));
    if (until) setLockedUntil(until);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (secondsLeft > 0) return;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) {
      setLoading(false);
      recordFailure();
      toast.error("Incorrect email or password.");
      return;
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (!isAdmin) {
      await supabase.auth.signOut();
      setLoading(false);
      recordFailure();
      toast.error("This account is not authorised for admin access.");
      return;
    }
    sessionStorage.removeItem(LOCK_KEY);
    setLoading(false);
    navigate({ to: "/admin", replace: true });
  };

  return (
    <AuthLayout eyebrow="Restricted" title="Investigator console" subtitle="Only authorised administrators can review evidence and decide claims.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="a-email">Work email</Label>
          <Input id="a-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldError msg={errors.email} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="a-pass">Password</Label>
          <PasswordInput id="a-pass" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FieldError msg={errors.password} />
        </div>
        <Button type="submit" size="lg" disabled={loading || secondsLeft > 0}>
          {loading ? <Loader2 className="animate-spin" /> : <Lock />}
          {secondsLeft > 0 ? `Locked — retry in ${secondsLeft}s` : "Sign in as administrator"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Policyholder?{" "}
        <Link to="/auth" className="font-semibold text-primary hover:underline">
          User login
        </Link>
      </p>
    </AuthLayout>
  );
}
