import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthLayout, FieldError } from "@/components/layout/AuthLayout";
import { registerSchema, safeRedirect, signInSchema } from "@/lib/validation";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional(), tab: z.enum(["signin", "register", "forgot"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — ClaimLens AI" },
      { name: "description", content: "Sign in or create your ClaimLens AI account to submit and track insurance claims." },
      { property: "og:title", content: "Sign in — ClaimLens AI" },
      { property: "og:description", content: "Policyholder access to submit and track insurance claims." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState(search.tab ?? "signin");
  const target = safeRedirect(search.redirect);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: target, replace: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthLayout eyebrow="Policyholder" title="Your claims, verified." subtitle="Sign in to submit a claim with live camera evidence and track it in real time.">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>
        <TabsContent value="signin" className="pt-4">
          <SignInForm onForgot={() => setTab("forgot")} onDone={() => navigate({ to: target, replace: true })} />
        </TabsContent>
        <TabsContent value="register" className="pt-4">
          <RegisterForm />
        </TabsContent>
        <TabsContent value="forgot" className="pt-4">
          <ForgotForm onBack={() => setTab("signin")} onRegister={() => setTab("register")} />
        </TabsContent>
      </Tabs>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Investigator?{" "}
        <Link to="/admin-login" className="font-semibold text-primary hover:underline">
          Admin login
        </Link>
      </p>
    </AuthLayout>
  );
}


function SignInForm({ onForgot, onDone }: { onForgot: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("Email not confirmed") ? "Please confirm your email first — check your inbox." : "Incorrect email or password.");
      return;
    }
    toast.success("Welcome back");
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FieldError msg={errors.email} />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="si-pass">Password</Label>
          <button type="button" onClick={onForgot} className="text-xs font-semibold text-primary hover:underline">
            Forgot password?
          </button>
        </div>
        <PasswordInput id="si-pass" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FieldError msg={errors.password} />
      </div>
      <Button type="submit" disabled={loading} size="lg">
        {loading && <Loader2 className="animate-spin" />} Sign in
      </Button>
    </form>
  );
}

function RegisterForm() {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { full_name: parsed.data.full_name, phone: parsed.data.phone },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(
        /pwned|leaked|compromised/i.test(error.message)
          ? "This password appeared in a data breach. Please choose a different one."
          : error.message,
      );
      return;
    }
    setSent(true);
  };

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <MailCheck className="h-10 w-10 text-success" />
        <p className="font-semibold">Check your email</p>
        <p className="text-sm text-muted-foreground">We sent a confirmation link to {form.email}. Open it to activate your account.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-3.5" noValidate>
      {(
        [
          ["full_name", "Full name", "text", "name"],
          ["email", "Email", "email", "email"],
          ["phone", "Phone number", "tel", "tel"],
        ] as const
      ).map(([k, label, type, ac]) => (
        <div key={k} className="grid gap-1.5">
          <Label htmlFor={`r-${k}`}>{label}</Label>
          <Input id={`r-${k}`} type={type} autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          <FieldError msg={errors[k]} />
        </div>
      ))}
      <div className="grid gap-1.5">
        <Label htmlFor="r-pass">Password</Label>
        <PasswordInput id="r-pass" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p className="text-xs text-muted-foreground">8+ characters with upper & lower case and a number. Breached passwords are blocked.</p>
        <FieldError msg={errors.password} />
      </div>
      <Button type="submit" disabled={loading} size="lg">
        {loading && <Loader2 className="animate-spin" />} Create account
      </Button>
    </form>
  );
}

function ForgotForm({ onBack, onRegister }: { onBack: () => void; onRegister: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    const value = email.trim().toLowerCase();
    if (!z.string().email().safeParse(value).success) {
      setError("Enter a valid email");
      return;
    }
    setError(undefined);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(value, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) {
      const status = (err as { status?: number }).status;
      const msg =
        status === 429 || /rate limit|security purposes|too many/i.test(err.message)
          ? "Too many reset requests. Please wait a minute and try again."
          : "We couldn't send the reset email right now. Please try again shortly.";
      setError(msg);
      toast.error(msg);
      return;
    }
    // Same message whether or not the account exists (prevents account enumeration).
    setSent(true);
    setCooldown(60);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  return sent ? (
    <div className="space-y-4 py-2 text-center">
      <MailCheck className="mx-auto h-10 w-10 text-success" />
      <div className="space-y-1">
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          If an account is registered with <span className="font-medium text-foreground">{email.trim()}</span>, we've sent a
          link to reset your password. It can take a couple of minutes to arrive.
        </p>
      </div>
      <ul className="rounded-xl bg-muted p-3 text-left text-xs text-muted-foreground">
        <li>• Check your Spam, Junk or Promotions folder.</li>
        <li>• Make sure this is the email you registered with.</li>
        <li>• The link works once and expires after 1 hour.</li>
      </ul>
      <FieldError msg={error} />
      <div className="grid gap-2">
        <Button variant="outline" disabled={loading || cooldown > 0} onClick={() => void send()}>
          {loading && <Loader2 className="animate-spin" />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
        </Button>
        <Button variant="ghost" onClick={() => { setSent(false); setError(undefined); }}>Use a different email</Button>
        <Button variant="ghost" onClick={onBack}>Back to sign in</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        No account yet?{" "}
        <button type="button" onClick={onRegister} className="font-semibold text-primary hover:underline">
          Create one
        </button>
      </p>
    </div>
  ) : (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-sm text-muted-foreground">Enter the email you registered with and we'll send you a secure reset link.</p>
      <div className="grid gap-1.5">
        <Label htmlFor="f-email">Email</Label>
        <Input id="f-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FieldError msg={error} />
      </div>
      <Button type="submit" disabled={loading}>{loading && <Loader2 className="animate-spin" />} Send reset link</Button>
      <Button type="button" variant="ghost" onClick={onBack}>Back to sign in</Button>
    </form>
  );
}
