import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldCheck, KeyRound, MonitorSmartphone, LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { FieldError } from "@/components/layout/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useProfile, useSession, useSignOut } from "@/hooks/use-auth";
import { passwordSchema, phoneSchema } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & settings — ClaimLens AI" },
      { name: "description", content: "Manage your ClaimLens AI profile and account security." },
      { property: "og:title", content: "Profile & settings — ClaimLens AI" },
      { property: "og:description", content: "Manage your profile and account security." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { data: isAdmin } = useIsAdmin(user?.id);
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name, phone: profile.phone });
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.full_name.trim().length < 2) errs.full_name = "Enter your full name";
    if (!phoneSchema.safeParse(form.phone).success) errs.phone = "Enter a valid phone number";
    setErr(errs);
    if (Object.keys(errs).length || !user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: form.full_name.trim(), phone: form.phone.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };

  return (
    <AppShell title="Profile & settings">
      {isAdmin && (
        <Button asChild variant="outline" className="mb-4 w-full">
          <Link to="/admin"><LayoutDashboard /> Open investigator console</Link>
        </Button>
      )}
      <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold">Personal details</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="p-name">Full name</Label>
          <Input id="p-name" maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <FieldError msg={err.full_name} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-phone">Phone</Label>
          <Input id="p-phone" type="tel" maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <FieldError msg={err.phone} />
        </div>
        <div className="grid gap-1.5">
          <Label>Email</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
      </form>

      <ChangePassword />

      <div className="mt-4 space-y-3 rounded-2xl border bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-success" /> Sessions</h2>
        <Button variant="outline" className="w-full" onClick={() => void signOut("local")}>
          <LogOut /> Sign out
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => void signOut("global")}>
          <MonitorSmartphone /> Sign out on all devices
        </Button>
      </div>
    </AppShell>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = passwordSchema.safeParse(next);
    if (!current) return setErr("Enter your current password");
    if (!p.success) return setErr(p.error.issues[0].message);
    setErr(undefined);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: next, current_password: current } as { password: string });
    setLoading(false);
    if (error) return toast.error(/pwned|leaked/i.test(error.message) ? "This password appeared in a data breach. Choose another." : error.message);
    setCurrent("");
    setNext("");
    toast.success("Password changed");
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-info" /> Change password</h2>
      <div className="grid gap-1.5">
        <Label htmlFor="cur">Current password</Label>
        <PasswordInput id="cur" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new">New password</Label>
        <PasswordInput id="new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <FieldError msg={err} />
      </div>
      <Button type="submit" variant="secondary" disabled={loading}>{loading && <Loader2 className="animate-spin" />} Update password</Button>
    </form>
  );
}
