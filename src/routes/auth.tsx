import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Mail, Lock, Sparkles, TrendingUp, Target, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import roiBubble from "@/assets/roi-bubble.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  // If already signed in, bounce to the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) navigate({ to: "/", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      toast.error("Email and password are required");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return; // browser will redirect
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <ShowcasePanel mode={mode} />
      <div className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:py-14">
        {/* subtle ambient orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-60 blur-3xl lg:hidden"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent)" }}
        />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-[420px]"
        >
          <div className="flex items-center gap-3">
            <motion.img
              src={roiBubble}
              alt=""
              className="size-10 rounded-xl ring-1 ring-border"
              whileHover={{ rotate: -6, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
            />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                ROI SALES COMPANION
              </p>
              <Link to="/" className="text-[11px] text-muted-foreground hover:text-foreground">
                ← Back home
              </Link>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs font-medium">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="relative flex-1 rounded-full px-3 py-1.5 transition-colors"
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab-pill"
                    className="absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={`relative ${mode === m ? "text-foreground" : "text-muted-foreground"}`}>
                  {m === "signin" ? "Sign in" : "Create account"}
                </span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mt-7"
            >
              <h1 className="text-balance text-[28px] font-bold leading-[1.1] tracking-tight sm:text-3xl">
                {mode === "signin" ? (
                  <>Welcome back.<br /><span className="text-muted-foreground">Pick up where you left off.</span></>
                ) : (
                  <>Start closing<br /><span className="text-muted-foreground">with real numbers.</span></>
                )}
              </h1>
            </motion.div>
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            className="group mt-7 flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-card py-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <GoogleMark />
            <span>Continue with Google</span>
            <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-60" />
          </motion.button>

          <div className="my-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3.5">
            <Field
              icon={<Mail className="size-4" />}
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              focused={focused === "email"}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
            />
            <Field
              icon={<Lock className="size-4" />}
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              focused={focused === "password"}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
            />

            <motion.button
              type="submit"
              disabled={busy}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.985 }}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] ring-1 ring-white/20 backdrop-blur-md transition-shadow hover:shadow-lg disabled:opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, color-mix(in oklab, var(--primary) 92%, white 8%) 0%, color-mix(in oklab, var(--primary) 75%, black 20%) 100%)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/25 to-transparent"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <AnimatePresence mode="wait" initial={false}>
                {busy ? (
                  <motion.span
                    key="busy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    Working…
                  </motion.span>
                ) : (
                  <motion.span
                    key={mode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-2"
                  >
                    {mode === "signin" ? "Sign in" : "Create account"}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
            By continuing you agree to a private, single-user workspace. Your deals and templates stay scoped to your account.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────── Animated input ─────────── */

function Field({
  icon, label, type, value, onChange, autoComplete, minLength, focused, onFocus, onBlur,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const filled = value.length > 0;
  return (
    <div className="group relative">
      <motion.div
        animate={{
          borderColor: focused
            ? "color-mix(in oklab, var(--primary) 55%, var(--border))"
            : "var(--border)",
          boxShadow: focused
            ? "0 0 0 4px color-mix(in oklab, var(--primary) 14%, transparent)"
            : "0 0 0 0px transparent",
        }}
        transition={{ duration: 0.18 }}
        className="relative flex items-center rounded-full border bg-card px-1.5"
      >
        <span
          className={`pl-3 transition-colors ${focused || filled ? "text-foreground" : "text-muted-foreground"}`}
          aria-hidden
        >
          {icon}
        </span>
        <div className="relative flex-1">
          <motion.label
            initial={false}
            animate={{
              y: focused || filled ? -10 : 8,
              scale: focused || filled ? 0.78 : 1,
              color:
                focused
                  ? "color-mix(in oklab, var(--primary) 80%, var(--foreground))"
                  : "var(--muted-foreground)",
            }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-none absolute left-3 top-2.5 origin-left font-mono text-[11px] uppercase tracking-[0.2em]"
          >
            {label}
          </motion.label>
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            autoComplete={autoComplete}
            minLength={minLength}
            required
            className="block w-full bg-transparent px-3 pb-2 pt-5 text-sm text-foreground outline-none"
          />
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────── Left showcase panel ─────────── */

function ShowcasePanel({ mode }: { mode: "signin" | "signup" }) {
  return (
    <div
      className="relative hidden overflow-hidden lg:block"
      style={{ background: "var(--gradient-results)" }}
    >
      {/* Grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(120% 80% at 30% 20%, black 30%, transparent 75%)",
        }}
      />
      {/* Floating orbs */}
      <motion.div
        aria-hidden
        animate={{ y: [0, -18, 0], x: [0, 10, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-16 top-24 size-72 rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--primary) 55%, transparent)" }}
      />
      <motion.div
        aria-hidden
        animate={{ y: [0, 22, 0], x: [0, -14, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-12 right-0 size-80 rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--metric-accent) 40%, transparent)" }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] opacity-80">
            ROI SALES COMPANION
          </span>
        </div>

        <div className="space-y-10">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-balance text-[44px] font-bold leading-[1.02] tracking-tight xl:text-[56px]"
          >
            Turn discovery calls
            <br />
            into <span className="italic text-white/70">defensible</span> ROI.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-md text-[15px] leading-relaxed text-white/65"
          >
            Powerful sales tool for securing and serving clients.

          </motion.p>

        </div>

        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.24em] text-white/45">
          <span>Private workspace</span>
          <span>RLS · scoped to you</span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon, label, value, delay,
}: { icon: React.ReactNode; label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
    >
      <div className="flex items-center gap-1.5 text-white/55">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold tracking-tight">{value}</div>
    </motion.div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.4-1.13 2.59-2.41 3.39v2.82h3.9c2.28-2.1 3.6-5.19 3.6-8.45z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.9-2.82c-1.08.72-2.46 1.16-4.05 1.16-3.11 0-5.74-2.1-6.68-4.93H1.3v3.09C3.28 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.32 14.5A7.21 7.21 0 0 1 4.94 12c0-.87.15-1.71.38-2.5V6.41H1.3A11.99 11.99 0 0 0 0 12c0 1.93.46 3.76 1.3 5.59l4.02-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0 7.31 0 3.28 2.7 1.3 6.41l4.02 3.09C6.26 6.85 8.89 4.75 12 4.75z"
      />
    </svg>
  );
}