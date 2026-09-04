import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Mail, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/aibuyer/authService";
import { AIBuyerBackground } from "@/components/AIBuyerBackground";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<"customer" | "merchant">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  useEffect(() => {
    if (authService.isAuthenticated()) {
      const user = authService.getUser();
      if (user?.role === "merchant") {
        navigate({ to: "/merchant", replace: true });
      } else if (user?.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/app", replace: true });
      }
    }
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
        await authService.signUp(email.trim(), password, selectedRole);
        toast.success(
          selectedRole === "merchant"
            ? "Merchant account created — welcome to RazorReach."
            : "Customer account created — welcome to RazorReach.",
        );
      } else {
        await authService.signIn(email.trim(), password, selectedRole);
        toast.success("Welcome back.");
      }
      const user = authService.getUser();
      if (user?.role === "merchant") {
        navigate({ to: "/merchant", replace: true });
      } else if (user?.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/app", replace: true });
      }
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
      await authService.signInWithGoogle(selectedRole);
      toast.success("Signed in with Google.");
      const user = authService.getUser();
      if (user?.role === "merchant") {
        navigate({ to: "/merchant", replace: true });
      } else if (user?.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/app", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authService.signInWithApple(selectedRole);
      toast.success("Signed in with Apple.");
      const user = authService.getUser();
      if (user?.role === "merchant") {
        navigate({ to: "/merchant", replace: true });
      } else if (user?.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/app", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apple sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email address first.");
      return;
    }
    try {
      await authService.sendPasswordReset(email.trim());
      toast.success("Password reset instructions sent to your email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <ShowcasePanel mode={mode} />
      <div className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-60 blur-3xl lg:hidden"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-[420px]"
        >
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs font-medium">
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
                <span
                  className={`relative ${mode === m ? "text-foreground" : "text-muted-foreground"}`}
                >
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
                  <>
                    Welcome back.
                    <br />
                    <span className="text-muted-foreground">Make better product decisions.</span>
                  </>
                ) : (
                  <>
                    Start deciding
                    <br />
                    <span className="text-muted-foreground">with confidence.</span>
                  </>
                )}
              </h1>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 space-y-1.5">
            <label className="block text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Choose Your Workspace
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRole("customer")}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all",
                  selectedRole === "customer"
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-xs font-bold">Customer</span>
                <span className="text-[10px] opacity-75">Shop smarter with AI</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("merchant")}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all",
                  selectedRole === "merchant"
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                    : "border-border bg-card/60 text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-xs font-bold">Merchant</span>
                <span className="text-[10px] opacity-75">Turn demand into revenue</span>
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <motion.button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.985 }}
              className="group flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-card py-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <GoogleMark />
              <span>Continue with Google</span>
              <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-60" />
            </motion.button>

            <motion.button
              type="button"
              onClick={handleApple}
              disabled={busy}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.985 }}
              className="group flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-card py-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <AppleMark />
              <span>Continue with Apple</span>
              <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-60" />
            </motion.button>
          </div>

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

            {mode === "signin" && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

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
                    Signing you in…
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
            By continuing you agree to a private, single-user workspace. Your searches and decisions
            stay scoped to your account.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  autoComplete,
  minLength,
  focused,
  onFocus,
  onBlur,
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
              color: focused
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

function ShowcasePanel({ mode }: { mode: "signin" | "signup" }) {
  return (
    <AIBuyerBackground className="hidden lg:block">
      <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white xl:p-14">
        <div />

        <div className="space-y-10">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-balance text-[44px] font-bold leading-[1.02] tracking-tight xl:text-[56px]"
          >
            Search redefined.
            <br />
            <span className="italic text-white">Decisions simplified.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="max-w-md text-[15px] leading-relaxed text-white/65"
          >
            An AI-powered product decision engine that understands your needs, compares real
            products, and helps you choose.
          </motion.p>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.24em] text-white/45">
          <span>Private workspace</span>
          <span>RazorReach Platform</span>
        </div>
      </div>
    </AIBuyerBackground>
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

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.35c.66-.8 1.11-1.92.99-3.04-.96.04-2.13.64-2.81 1.44-.61.71-1.14 1.86-1 2.97 1.08.08 2.17-.57 2.82-1.37z" />
    </svg>
  );
}
