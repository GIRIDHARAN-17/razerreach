import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  Compass,
  History,
  ShoppingBag,
  Settings,
  User,
  LogOut,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Store,
  BadgeCheck,
  X,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/aibuyer/authService";
import { searchService } from "@/lib/aibuyer/searchService";
import { selectionService } from "@/lib/aibuyer/selectionService";
import { checkoutService } from "@/lib/aibuyer/checkoutService";
import type { Recommendation, RecommendationSession, SelectionResult, Order } from "@/lib/aibuyer/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppPage,
});

type Phase =
  | "idle"
  | "understanding"
  | "searching"
  | "evaluating"
  | "results"
  | "checkout";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function AppPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState("search");

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar activeNav={activeNav} onNav={setActiveNav} onLogout={handleLogout} />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <Workspace />
      </main>
    </div>
  );
}

function Sidebar({
  activeNav,
  onNav,
  onLogout,
}: {
  activeNav: string;
  onNav: (key: string) => void;
  onLogout: () => void;
}) {
  const navItems = [
    { key: "search", label: "New Search", icon: Search },
    { key: "explore", label: "Explore", icon: Compass },
    { key: "history", label: "History", icon: History },
    { key: "orders", label: "Orders", icon: ShoppingBag },
  ];

  const bottomItems = [
    { key: "settings", label: "Settings", icon: Settings },
    { key: "profile", label: "Profile", icon: User },
  ];

  return (
    <aside
      className="relative hidden w-64 flex-col justify-between border-r border-border bg-foreground p-5 text-background lg:flex"
      style={{ background: "var(--gradient-results)" }}
    >
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-background/10 text-background ring-1 ring-white/10">
            <Sparkles className="size-5" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">AI BUYER</span>
        </div>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNav(item.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-1">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function Workspace() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [understandingStep, setUnderstandingStep] = useState(0);
  const [session, setSession] = useState<RecommendationSession | null>(null);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [selection, setSelection] = useState<SelectionResult | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleSearch = async (text: string) => {
    if (!text.trim()) return;
    setQuery(text);
    setPhase("understanding");
    setUnderstandingStep(0);
    setSession(null);
    setSelected(null);
    setSelection(null);
    setOrder(null);
    setShowConfirmation(false);

    await delay(700);
    setUnderstandingStep(1);
    await delay(500);
    setUnderstandingStep(2);
    await delay(500);
    setUnderstandingStep(3);
    await delay(400);
    setPhase("searching");
    await delay(700);
    setPhase("evaluating");
    await delay(900);

    const result = await searchService.submitQuery(text);
    setSession(result);
    setPhase("results");
  };

  const handleSelect = async (recommendation: Recommendation) => {
    setSelected(recommendation);
    if (!session) return;
    const result = await selectionService.selectRecommendation(session.id, recommendation);
    setSelection(result);
  };

  const handleContinue = async () => {
    if (!selection) return;
    const prepared = await checkoutService.prepareOrder(selection);
    setOrder(prepared);
    setShowConfirmation(false);
    setPhase("checkout");
  };

  const handleProceedToPurchase = () => {
    setShowConfirmation(true);
  };

  const handlePayment = async () => {
    if (!order) return;
    await checkoutService.initiatePayment(order);
    toast.success("Payment initiated (Razorpay Test Mode).");
  };

  const isCloseDecision = useMemo(() => {
    if (!session || session.recommendations.length < 2) return false;
    const [first, second] = session.recommendations;
    return Math.abs(first.decision.score - second.decision.score) <= 0.1;
  }, [session]);

  return (
    <div className="relative flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-2xl"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-primary)]"
                >
                  <Sparkles className="size-7" />
                </motion.div>
                <h1 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                  Tell me what you're looking for?
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Describe a product, brand, budget, or use case. AI Buyer will compare real options and help you decide.
                </p>
              </div>
              <SearchInput onSubmit={handleSearch} />
            </motion.div>
          )}

          {(phase === "understanding" || phase === "searching" || phase === "evaluating") && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-xl"
            >
              <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
                <ThinkingPhase phase={phase} step={understandingStep} />
              </div>
            </motion.div>
          )}

          {phase === "results" && session && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-4xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Top recommendations</h2>
                  <p className="text-sm text-muted-foreground">For: "{session.query}"</p>
                </div>
                <button
                  onClick={() => setPhase("idle")}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  New search
                </button>
              </div>

              {isCloseDecision && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"
                >
                  <p className="font-medium text-primary">These options are very close.</p>
                  <p className="text-muted-foreground">Your preference may matter more than the score difference.</p>
                </motion.div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                {session.recommendations.map((rec, index) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    index={index}
                    isSelected={selected?.id === rec.id}
                    onSelect={() => handleSelect(rec)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {phase === "checkout" && order && (
            <motion.div
              key="checkout"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-xl"
            >
              <CheckoutPreview order={order} onPayment={handlePayment} onBack={() => setPhase("results")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selection && phase === "results" && (
          <SelectionBar
            selection={selection}
            onContinue={handleProceedToPurchase}
            onClear={() => {
              setSelected(null);
              setSelection(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirmation && selection && (
          <ConfirmationModal
            selection={selection}
            onBack={() => setShowConfirmation(false)}
            onProceed={handleContinue}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="mt-10"
    >
      <div className="relative flex items-center rounded-2xl border border-border bg-card p-2 shadow-card transition-shadow focus-within:shadow-[var(--shadow-primary)] focus-within:ring-1 focus-within:ring-primary/20">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="I need Samsung headphones under ₹20,000"
          className="flex-1 bg-transparent px-4 py-4 text-base outline-none placeholder:text-muted-foreground/70"
        />
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-shadow hover:shadow-lg"
        >
          <Search className="size-4" />
          Search
        </motion.button>
      </div>
    </form>
  );
}

function ThinkingPhase({ phase, step }: { phase: Phase; step: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <p className="font-medium">Understanding your request...</p>
      </div>

      <div className="space-y-3 pl-11">
        <EntityCheck label="Samsung" active={step >= 1} />
        <EntityCheck label="Headphones" active={step >= 2} />
        <EntityCheck label="Budget ≤ ₹20,000" active={step >= 3} />
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <StatusLine active={phase === "searching" || phase === "evaluating"} label="Searching products..." />
        <StatusLine active={phase === "evaluating"} label="Decision Engine evaluating..." />
      </div>
    </div>
  );
}

function EntityCheck({ label, active }: { label: string; active: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: active ? 1 : 0.4 }}
      className="flex items-center gap-2 text-sm"
    >
      <div
        className={cn(
          "flex size-5 items-center justify-center rounded-full border transition-colors",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted"
        )}
      >
        {active && <Check className="size-3" />}
      </div>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </motion.div>
  );
}

function StatusLine({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={cn("size-2 rounded-full", active ? "animate-pulse bg-primary" : "bg-muted")} />
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  index,
  isSelected,
  onSelect,
}: {
  recommendation: Recommendation;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { product, decision } = recommendation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-5 shadow-card transition-all",
        isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold leading-snug tracking-tight">{product.name}</h3>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Store className="size-3.5" />
            {product.merchant}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">
            {product.currency}{product.price.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {product.features.map((feature) => (
          <span
            key={feature}
            className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            {feature}
          </span>
        ))}
      </div>

      <div className="mt-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-primary">Decision Score</span>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
          className="mt-1 flex items-baseline gap-1"
        >
          <span className="text-3xl font-bold tracking-tight text-foreground">{decision.score.toFixed(2)}</span>
          <span className="text-sm text-muted-foreground">/ {decision.maxScore}</span>
        </motion.div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        Why this product?
        {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <ul className="mt-3 space-y-2 border-t border-border pt-3">
              {decision.reasons.map((reason, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 text-positive" />
                  {reason}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto pt-5">
        <motion.button
          onClick={onSelect}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          className={cn(
            "w-full rounded-xl py-2.5 text-sm font-semibold transition-colors",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card hover:bg-muted"
          )}
        >
          {isSelected ? "Selected" : "Select"}
        </motion.button>
      </div>
    </motion.div>
  );
}

function SelectionBar({
  selection,
  onContinue,
  onClear,
}: {
  selection: SelectionResult;
  onContinue: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 p-4 shadow-lift backdrop-blur-md lg:left-64"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{selection.product.name}</p>
          <p className="text-sm text-muted-foreground">
            {selection.product.currency}{selection.product.price.toLocaleString()} · {selection.product.merchant}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClear}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <motion.button
            onClick={onContinue}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-shadow hover:shadow-lg"
          >
            Continue
            <ArrowRight className="size-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function ConfirmationModal({
  selection,
  onBack,
  onProceed,
}: {
  selection: SelectionResult;
  onBack: () => void;
  onProceed: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lift"
      >
        <h3 className="text-lg font-semibold tracking-tight">You selected</h3>
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <p className="font-medium">{selection.product.name}</p>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{selection.product.merchant}</span>
            <span className="font-semibold">
              {selection.product.currency}{selection.product.price.toLocaleString()}
            </span>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Would you like to proceed to purchase?</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Go Back
          </button>
          <motion.button
            onClick={onProceed}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-shadow hover:shadow-lg"
          >
            Proceed to Purchase
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CheckoutPreview({
  order,
  onPayment,
  onBack,
}: {
  order: Order;
  onPayment: () => void;
  onBack: () => void;
}) {
  const { selection } = order;

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">Ready for checkout</h2>
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Product</span>
          <span className="max-w-[60%] text-right font-medium">{selection.product.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Merchant</span>
          <span className="font-medium">{selection.product.merchant}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price</span>
          <span className="font-medium">
            {selection.product.currency}{selection.product.price.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Quantity</span>
          <span className="font-medium">{selection.quantity}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-3">
          <span className="font-medium">Total</span>
          <span className="font-bold">
            {selection.product.currency}{order.total.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm">
          <CreditCard className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Payment status</span>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Not started</span>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
        <Sparkles className="size-3.5" />
        Razorpay Test Mode
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
        >
          Back
        </button>
        <motion.button
          onClick={onPayment}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-shadow hover:shadow-lg"
        >
          Continue to Payment
        </motion.button>
      </div>
    </div>
  );
}
