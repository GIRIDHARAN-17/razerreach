import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Brain, Sliders, ShieldCheck } from "lucide-react";
import { authService } from "@/lib/aibuyer/authService";
import { AIBuyerBackground } from "@/components/AIBuyerBackground";
import { RazorpayLogo } from "@/components/RazorpayLogo";
import { ParticleText } from "@/components/ParticleText";
import { GooeyNav } from "@/components/GooeyNav";
import { AnimatedContent } from "@/components/AnimatedContent";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const isAuthenticated = authService.isAuthenticated();

  const handleScrollToHowItWorks = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const element = document.getElementById("how-it-works");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const navItems = isAuthenticated
    ? [
        {
          label: "Workspace",
          onClick: () => navigate({ to: "/app" }),
          icon: <ArrowRight className="size-3.5" />,
          variant: "primary" as const,
        },
      ]
    : [
        {
          label: "Sign In",
          onClick: () => navigate({ to: "/login" }),
        },
        {
          label: "Sign Up",
          onClick: () => navigate({ to: "/auth" }),
          variant: "primary" as const,
        },
        {
          label: "Workspace",
          onClick: () => navigate({ to: "/app" }),
        },
      ];

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/80 px-6 py-3.5 backdrop-blur-md">
        {/* LEFT SIDE: RazorReach Logo */}
        <Link to="/" className="flex items-center gap-2">
          <RazorpayLogo className="h-7 w-auto" />
        </Link>

        {/* RIGHT SIDE: Navigation Actions */}
        <div className="flex items-center gap-3">
          <GooeyNav items={navItems} />
        </div>
      </header>

      {/* Hero Section with Reusable Background */}
      <main className="flex-1">
        <AIBuyerBackground className="px-6 py-20 lg:py-32 text-white border-b border-border">
          <div className="mx-auto max-w-4xl text-center relative z-10 space-y-6">
            <AnimatedContent distance={40} duration={0.7} delay={0.1}>
              <div className="flex flex-col items-center justify-center space-y-1">
                <ParticleText
                  text="Search redefined."
                  fontSize={96}
                  fontWeight="800"
                  density={2.5}
                  particleSize={2.5}
                  color="#ffffff"
                  highlightColor="#ffffff"
                  gatherDuration={1.2}
                  glow
                />
                <ParticleText
                  text="Decisions simplified."
                  fontSize={96}
                  fontWeight="800"
                  fontStyle="italic"
                  density={2.5}
                  particleSize={2.5}
                  color="#ffffff"
                  highlightColor="#ffffff"
                  gatherDuration={1.4}
                  glow
                />
              </div>
            </AnimatedContent>

            <AnimatedContent distance={40} duration={0.7} delay={0.25}>
              <p className="mx-auto max-w-2xl text-lg text-white/70 sm:text-xl leading-relaxed">
                An AI-powered product decision engine that understands your needs, compares real
                products, and helps you choose with confidence.
              </p>
            </AnimatedContent>

            <AnimatedContent distance={40} duration={0.7} delay={0.35}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate({ to: isAuthenticated ? "/app" : "/auth" })}
                  className="group relative flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
                >
                  <span>Start Deciding</span>
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                </button>
                <a
                  href="#how-it-works"
                  onClick={handleScrollToHowItWorks}
                  className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-4 text-base font-medium text-white transition-colors hover:bg-white/20 backdrop-blur-md"
                >
                  See How It Works
                </a>
              </div>
            </AnimatedContent>
          </div>
        </AIBuyerBackground>

        {/* How It Works Section */}
        <section id="how-it-works" className="border-t border-border bg-card/50 px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <AnimatedContent distance={30} duration={0.6}>
              <h2 className="text-center text-xs font-mono uppercase tracking-[0.25em] text-primary font-semibold">
                The Decision Flow
              </h2>
              <p className="mt-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
                From natural prompt to verified checkout
              </p>
            </AnimatedContent>

            <div className="mt-14 grid gap-4 sm:grid-cols-5">
              {[
                {
                  step: "01",
                  label: "Natural Prompt",
                  desc: "Type what you need in plain English",
                },
                { step: "02", label: "Real Products", desc: "Live web & catalog aggregation" },
                { step: "03", label: "Decision Score", desc: "Multi-factor constraint scoring" },
                { step: "04", label: "Evidence Check", desc: "Transparent evidence & rationale" },
                { step: "05", label: "Secure Purchase", desc: "Razorpay test mode verification" },
              ].map((s, idx) => (
                <AnimatedContent
                  key={idx}
                  distance={40}
                  duration={0.6}
                  delay={idx * 0.07}
                  className="h-full"
                >
                  <div className="h-full rounded-xl border border-border bg-background p-4 shadow-sm text-center flex flex-col items-center justify-center">
                    <span className="font-mono text-xs font-bold text-primary">{s.step}</span>
                    <h3 className="mt-2 text-sm font-semibold">{s.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </AnimatedContent>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="border-t border-border bg-muted/20 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <AnimatedContent distance={30} duration={0.6}>
              <h2 className="text-center text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
                Core Capabilities
              </h2>
              <p className="mt-2 text-center text-2xl font-bold tracking-tight sm:text-3xl">
                Engineered for Product Decisions
              </p>
            </AnimatedContent>

            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {[
                {
                  icon: <Brain className="size-6 text-primary" />,
                  title: "Natural Requirement Intelligence",
                  description:
                    "Understands budgets, technical specifications, and personal preferences from natural conversational input.",
                },
                {
                  icon: <Sliders className="size-6 text-primary" />,
                  title: "Multi-Dimensional Decision Engine",
                  description:
                    "Ranks candidates using quantitative decision scores based on verified features and constraints.",
                },
                {
                  icon: <ShieldCheck className="size-6 text-primary" />,
                  title: "Transparent & Verifiable",
                  description:
                    "Provides objective evidence and clear reasons for every recommendation without bias.",
                },
              ].map((card, idx) => (
                <AnimatedContent key={idx} distance={40} duration={0.6} delay={idx * 0.1}>
                  <FeatureCard icon={card.icon} title={card.title} description={card.description} />
                </AnimatedContent>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs font-mono text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} RazorReach — Product Decision Engine</p>
          <div className="flex items-center gap-6">
            <span>Private Workspace</span>
            <span>Razorpay Integration</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-card">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
