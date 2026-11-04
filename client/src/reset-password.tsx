import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthLayout, FieldError } from "@/components/layout/AuthLayout";
import { passwordSchema } from "@/lib/validation";
import { PasswordInput } from "@/components/PasswordInput";
import { markSessionVerified } from "@/lib/auth-guard";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — ClaimLens AI" },
      { name: "description", content: "Choose a new password for your ClaimLens AI account." },
      { property: "og:title", content: "Reset password — ClaimLens AI" },
      { property: "og:description", content: "Choose a new password for your ClaimLens AI account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [linkError, setLinkError] = useState<string>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    const errDesc = params.get("error_description");
    if (errDesc) {
      setLinkError(/expired|invalid/i.test(errDesc) ? "This reset link has expired or was already used." : errDesc.replace(/\+/g, " "));
      setStatus("invalid");
      return;
    }
    const hasToken = params.has("access_token") || params.has("code") || params.get("type") === "recovery";
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setStatus("ready");
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setStatus("ready");
      else if (!hasToken) setStatus("invalid");
    });
    // If a token was in the URL but no session appeared, treat the link as invalid.
    const t = hasToken ? setTimeout(() => setStatus((cur) => (cur === "checking" ? "invalid" : cur)), 6000) : undefined;
    return () => {
      data.subscription.unsubscribe();
      if (t) clearTimeout(t);
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (password !== confirm) return setError("Passwords do not match");
    setError(undefined);
    setLoading(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ data: { user: null }; error: Error }>((resolve) => {
      timer = setTimeout(
        () => resolve({ data: { user: null }, error: new Error("This is taking too long. Check your connection and try again.") }),
        20_000,
      );
    });
    const { data, error: err } = await Promise.race([supabase.auth.updateUser({ password }), timeout]);
    clearTimeout(timer);
    if (err) {
      setLoading(false);
      toast.error(
        /pwned|leaked|compromised|weak/i.test(err.message)
          ? "This password appeared in a data breach. Choose another."
          : /different from the old/i.test(err.message)
            ? "New password must be different from your old one."
            : err.message,
      );
      return;
    }
    // The server just accepted this session's token, so skip re-checking it on the next page.
    const { data: s } = await supabase.auth.getSession();
    if (s.session && data.user) markSessionVerified(s.session.access_token, data.user);
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <AuthLayout eyebrow="Account security" title="Set a new password" subtitle="Use a strong password you haven't used elsewhere.">
      {status === "checking" ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : status === "invalid" ? (
        <div className="space-y-4 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            {linkError ?? "Open this page from the reset link in your email."} Request a new link to continue.
          </p>
          <Button asChild>
            <Link to="/auth" search={{ tab: "forgot" }}>Request a new reset link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="np">New password</Label>
            <PasswordInput id="np" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">8+ characters with upper & lower case and a number.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cp">Confirm password</Label>
            <PasswordInput id="cp" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <FieldError msg={error} />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Saving new password…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
