import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { ShieldCheck } from "lucide-react";

export function AuthLayout({ children, eyebrow, title, subtitle }: { children: ReactNode; eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen bg-hero">
      <div className="grid-pattern min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
          <Link to="/" className="mb-8 self-start">
            <Logo inverted />
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold text-navy-foreground">{title}</h1>
          <p className="mt-2 text-sm text-navy-foreground/70">{subtitle}</p>
          <div className="mt-6 rounded-3xl bg-card p-5 shadow-elevated sm:p-6">{children}</div>
          <p className="mt-6 flex items-center gap-2 text-xs text-navy-foreground/60">
            <ShieldCheck className="h-4 w-4" /> Encrypted sessions · role-based access · private evidence storage
          </p>
        </div>
      </div>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string | undefined }) {
  if (!msg) return null;
  return <p className="text-xs font-medium text-destructive">{msg}</p>;
}
