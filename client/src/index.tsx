import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ScanEye, FileSearch, UserCheck, ShieldCheck, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/Logo";
import heroCar from "@/assets/hero-car.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClaimLens AI — Verified vehicle claims, human decisions" },
      {
        name: "description",
        content: "Capture live-camera evidence, get instant quality checks, and let AI prepare the investigation while a human makes the call.",
      },
      { property: "og:title", content: "ClaimLens AI — Verified vehicle claims, human decisions" },
      { property: "og:description", content: "Live-camera evidence, multimodal AI investigation, human-in-the-loop decisions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { icon: Camera, title: "Live camera evidence", text: "Front, rear, sides and close-ups captured on the spot — no gallery shortcuts." },
  { icon: ScanEye, title: "Two-step verification", text: "Instant quality checks, then AI compares each photo with your description." },
  { icon: FileSearch, title: "Multimodal investigation", text: "Photos, policy and repair estimates are cross-checked with cited sources." },
  { icon: UserCheck, title: "A human decides", text: "Investigators approve, reject or request evidence. AI never decides alone." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-hero">
        <div className="grid-pattern">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-6">
            <nav className="flex items-center justify-between">
              <Logo inverted />
              <div className="flex gap-2">
                <Button asChild variant="heroOutline" size="sm">
                  <Link to="/admin-login"><Lock /> Admin</Link>
                </Button>
                <Button asChild variant="hero" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            </nav>

            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-navy-foreground/20 bg-navy-foreground/5 px-3 py-1 text-xs font-semibold text-sky">
                  <ShieldCheck className="h-3.5 w-3.5" /> AI-assisted · human-decided
                </p>
                <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-navy-foreground sm:text-6xl">
                  Vehicle claims,<br />
                  <span className="text-sky">verified at the scene.</span>
                </h1>
                <p className="mt-5 max-w-lg text-base text-navy-foreground/75 sm:text-lg">
                  ClaimLens AI checks every photo as you take it, builds a sourced investigation report, and hands the final decision to a qualified investigator.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="hero" size="lg">
                    <Link to="/auth" search={{ tab: "register" }}>
                      Start a claim <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="heroOutline" size="lg">
                    <Link to="/auth">I already have an account</Link>
                  </Button>
                </div>
              </div>
              <div className="relative">
                <img
                  src={heroCar}
                  alt="Vehicle with AI damage scan overlay"
                  width={1280}
                  height={960}
                  className="w-full rounded-3xl border border-navy-foreground/10 object-cover shadow-elevated"
                />
                <div className="absolute -bottom-5 left-5 rounded-2xl bg-card p-3 pr-5 shadow-elevated">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Front bumper</p>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-success">
                    <ShieldCheck className="h-4 w-4" /> Photo verified
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold sm:text-3xl">From accident to decision in four steps</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        AI findings are investigative signals, never proof of fraud. Every decision is made by a person.
      </footer>
    </div>
  );
}
