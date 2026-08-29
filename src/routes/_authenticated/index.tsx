import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { toast } from "sonner";
import {
  Cloud,
  Briefcase,
  Sparkles,
  PlusSquare,
  Save,
  Settings as SettingsIcon,
  Search,
  Globe,
  Plus,
  Trash2,
  FileDown,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  X,
  ImagePlus,
  Loader2,
  Wand2,
  Sigma,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Share2,
  FileText,
  Pencil,
  Link2,
  Copy as CopyIcon,
  ExternalLink,
  FolderOpen,
  CheckCircle2,
  BookMarked,
  HelpCircle,
  LayoutTemplate,
  Palette,
  ListChecks,
  Lightbulb,
  LogOut,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { enrichCompany, extractBranding, generateSummary, proxyImageAsDataUrl, rewriteBlock } from "@/lib/ai.functions";
import type { Template, Field, Formula, Deal, ResearchResult } from "@/lib/types";
import roiBubble from "@/assets/roi-bubble.png";
import { compute } from "@/lib/calc";
import {
  hasAdditiveTerm,
  referencesIdentifier,
  removeAdditiveTerm,
  setFormulaRole,
} from "@/lib/formula";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { AnimatedNumber } from "@/components/animated-number";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({ component: Page });

/* ─────────────── Brand Themes ─────────────── */

type BrandTheme = {
  id: string;
  name: string;
  primary: string; // oklch for --primary / --ring
  from: string;    // gradient start hex (logo dot, action buttons)
  to: string;      // gradient end hex
  gradient: string; // for dark results card background
};

const BRAND_THEMES: BrandTheme[] = [
  {
    id: "indigo",
    name: "Indigo",
    primary: "oklch(0.6 0.22 275)",
    from: "#6366f1",
    to: "#1d4ed8",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.08 260) 0%, oklch(0.16 0.04 255) 45%, oklch(0.10 0.02 250) 100%)",
  },
  {
    id: "orange",
    name: "Ember",
    primary: "oklch(0.66 0.22 38)",
    from: "#fb923c",
    to: "#c2410c",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.30 0.10 45) 0%, oklch(0.18 0.05 40) 45%, oklch(0.10 0.02 35) 100%)",
  },
  {
    id: "emerald",
    name: "Emerald",
    primary: "oklch(0.62 0.17 160)",
    from: "#10b981",
    to: "#047857",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.09 165) 0%, oklch(0.16 0.04 160) 45%, oklch(0.10 0.02 160) 100%)",
  },
  {
    id: "crimson",
    name: "Crimson",
    primary: "oklch(0.6 0.22 25)",
    from: "#ef4444",
    to: "#991b1b",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.10 25) 0%, oklch(0.16 0.05 25) 45%, oklch(0.10 0.02 25) 100%)",
  },
  {
    id: "violet",
    name: "Violet",
    primary: "oklch(0.6 0.24 305)",
    from: "#a855f7",
    to: "#6b21a8",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.10 305) 0%, oklch(0.16 0.05 300) 45%, oklch(0.10 0.02 295) 100%)",
  },
  {
    id: "teal",
    name: "Teal",
    primary: "oklch(0.62 0.13 195)",
    from: "#14b8a6",
    to: "#0f766e",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.08 200) 0%, oklch(0.16 0.04 195) 45%, oklch(0.10 0.02 195) 100%)",
  },
  {
    id: "rose",
    name: "Rose",
    primary: "oklch(0.65 0.20 5)",
    from: "#f43f5e",
    to: "#9f1239",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.10 10) 0%, oklch(0.16 0.05 5) 45%, oklch(0.10 0.02 5) 100%)",
  },
  {
    id: "slate",
    name: "Slate",
    primary: "oklch(0.45 0.04 250)",
    from: "#475569",
    to: "#0f172a",
    gradient:
      "radial-gradient(120% 80% at 0% 0%, oklch(0.28 0.03 250) 0%, oklch(0.18 0.02 250) 45%, oklch(0.10 0.01 250) 100%)",
  },
];

/* Remember the user's most recently chosen brand color across sessions.
   Defaults to "indigo" for first-time use. */
const BRAND_COLOR_STORAGE_KEY = "lastBrandColor";
function getPreferredBrandColor(): string {
  if (typeof window === "undefined") return "indigo";
  try {
    return window.localStorage.getItem(BRAND_COLOR_STORAGE_KEY) || "indigo";
  } catch {
    return "indigo";
  }
}
function rememberBrandColor(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAND_COLOR_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function getBrandTheme(id: string | undefined | null): BrandTheme {
  if (id && id.startsWith("custom:")) {
    const [, from = "#6366f1", to = "#1d4ed8"] = id.split(":");
    return {
      id,
      name: "Custom",
      primary: from,
      from,
      to,
      gradient: `radial-gradient(120% 80% at 0% 0%, ${from} 0%, ${to} 55%, #0a0a0a 100%)`,
    };
  }
  return BRAND_THEMES.find((t) => t.id === id) ?? BRAND_THEMES[0];
}

function parseCustomTheme(id: string | undefined | null): { from: string; to: string } | null {
  if (!id || !id.startsWith("custom:")) return null;
  const [, from, to] = id.split(":");
  if (!from || !to) return null;
  return { from, to };
}

const ICONS: Record<string, typeof Cloud> = {
  cloud: Cloud,
  briefcase: Briefcase,
  sparkles: Sparkles,
  "plus-square": PlusSquare,
};
const SCENARIOS = [
  { key: "conservative", label: "Conservative" },
  { key: "expected", label: "Expected" },
  { key: "optimistic", label: "Optimistic" },
] as const;
type ScenarioKey = (typeof SCENARIOS)[number]["key"];

const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "3cba0c38-407c-417b-ace8-8c712f6ac9d1",
    name: "SaaS / Software",
    description: "Per-seat subscription with productivity gains",
    industry: "saas",
    icon: "cloud",
    color_theme: "orange",
    parameters: [
      {
        key: "seats",
        label: "Number of Seats",
        type: "slider",
        min: 5,
        max: 5000,
        step: 5,
        default: 250,
        unit: "users",
        help: "Total active platform seats",
      },
      {
        key: "price_per_seat",
        label: "Price per Seat",
        type: "currency",
        min: 10,
        max: 2000,
        step: 10,
        default: 120,
        help: "Annual price per seat",
      },
      {
        key: "implementation_cost",
        label: "Implementation Cost",
        type: "currency",
        min: 0,
        max: 500000,
        step: 1000,
        default: 25000,
        help: "One-time onboarding/setup",
      },
    ],
    returns: [
      {
        key: "cost_per_member",
        label: "Cost per Team Member",
        type: "currency",
        min: 20000,
        max: 400000,
        step: 1000,
        default: 120000,
        help: "Fully-loaded annual cost per seat",
      },
      {
        key: "expected_improvement",
        label: "Expected Improvement",
        type: "percent",
        min: 1,
        max: 50,
        step: 1,
        default: 12,
        help: "Estimated productivity lift",
      },
      {
        key: "churn_reduction",
        label: "Churn Reduction",
        type: "percent",
        min: 0,
        max: 50,
        step: 1,
        default: 8,
        help: "Estimated retention lift",
      },
    ],
    formulas: [
      {
        key: "annual_cost",
        label: "Annual Investment",
        expression: "seats * price_per_seat + implementation_cost",
      },
      {
        key: "productivity_savings",
        label: "Productivity Savings",
        expression: "seats * cost_per_member * (expected_improvement / 100)",
      },
      {
        key: "churn_savings",
        label: "Retention Value",
        expression: "seats * price_per_seat * (churn_reduction / 100)",
      },
      {
        key: "annual_gain",
        label: "Annual Gain",
        expression: "productivity_savings + churn_savings",
      },
    ],
    outputs: [],
    scenarios: { conservative: 0.75, expected: 1, optimistic: 1.25 },
    is_builtin: true,
    sort_order: 1,
  },
  {
    id: "3b61b349-70f5-4c03-8a5b-30c80dc551ae",
    name: "Professional Services",
    description: "Billable hours, utilization & margin uplift",
    industry: "services",
    icon: "briefcase",
    color_theme: "orange",
    parameters: [
      {
        key: "billable_consultants",
        label: "Billable Consultants",
        type: "slider",
        min: 1,
        max: 500,
        step: 1,
        default: 25,
        unit: "FTE",
        help: "Headcount on billable work",
      },
      {
        key: "engagement_cost",
        label: "Tooling Investment",
        type: "currency",
        min: 0,
        max: 1000000,
        step: 1000,
        default: 80000,
        help: "Annual platform cost",
      },
      {
        key: "current_utilization",
        label: "Current Utilization",
        type: "percent",
        min: 20,
        max: 95,
        step: 1,
        default: 62,
        help: "Today's billable utilization",
      },
    ],
    returns: [
      {
        key: "cost_per_member",
        label: "Cost per Team Member",
        type: "currency",
        min: 50000,
        max: 500000,
        step: 1000,
        default: 180000,
        help: "Fully-loaded annual cost per consultant",
      },
      {
        key: "expected_improvement",
        label: "Expected Improvement",
        type: "percent",
        min: 1,
        max: 40,
        step: 1,
        default: 10,
        help: "Estimated utilization / output lift",
      },
    ],
    formulas: [
      { key: "annual_cost", label: "Annual Investment", expression: "engagement_cost" },
      {
        key: "annual_gain",
        label: "Annual Gain",
        expression: "billable_consultants * cost_per_member * (expected_improvement / 100)",
      },
    ],
    outputs: [],
    scenarios: { conservative: 0.75, expected: 1, optimistic: 1.25 },
    is_builtin: true,
    sort_order: 2,
  },
  {
    id: "362f59ba-cc72-482c-8b61-c5a8d1962819",
    name: "AI / Automation",
    description: "Workflow automation with FTE equivalent savings",
    industry: "ai",
    icon: "sparkles",
    color_theme: "orange",
    parameters: [
      {
        key: "platform_cost",
        label: "Platform / License Cost",
        type: "currency",
        min: 0,
        max: 1000000,
        step: 1000,
        default: 60000,
        help: "Annual subscription",
      },
      {
        key: "implementation_cost",
        label: "Implementation",
        type: "currency",
        min: 0,
        max: 500000,
        step: 1000,
        default: 40000,
        help: "Setup & integration",
      },
      {
        key: "workflows",
        label: "Workflows Automated",
        type: "slider",
        min: 1,
        max: 200,
        step: 1,
        default: 12,
        unit: "flows",
        help: "Distinct processes automated",
      },
    ],
    returns: [
      {
        key: "team_size",
        label: "Team Size Impacted",
        type: "slider",
        min: 1,
        max: 1000,
        step: 1,
        default: 50,
        unit: "people",
        help: "Headcount whose work is automated",
      },
      {
        key: "cost_per_member",
        label: "Cost per Team Member",
        type: "currency",
        min: 20000,
        max: 400000,
        step: 1000,
        default: 110000,
        help: "Fully-loaded annual cost per person",
      },
      {
        key: "expected_improvement",
        label: "Expected Improvement",
        type: "percent",
        min: 1,
        max: 60,
        step: 1,
        default: 15,
        help: "Productivity gained from automation",
      },
      {
        key: "error_reduction_value",
        label: "Error / Rework Cost Avoided",
        type: "currency",
        min: 0,
        max: 2000000,
        step: 1000,
        default: 75000,
        help: "Annual cost of errors eliminated",
      },
    ],
    formulas: [
      {
        key: "annual_cost",
        label: "Annual Investment",
        expression: "platform_cost + implementation_cost",
      },
      {
        key: "labor_savings",
        label: "Labor Savings",
        expression: "team_size * cost_per_member * (expected_improvement / 100)",
      },
      {
        key: "annual_gain",
        label: "Annual Gain",
        expression: "labor_savings + error_reduction_value",
      },
    ],
    outputs: [],
    scenarios: { conservative: 0.75, expected: 1, optimistic: 1.25 },
    is_builtin: true,
    sort_order: 3,
  },
  {
    id: "fedaa664-d6f1-4c03-b045-db426f93fdcc",
    name: "Blank / Custom",
    description: "Start from scratch — add your own parameters",
    industry: "custom",
    icon: "plus-square",
    color_theme: "orange",
    parameters: [
      {
        key: "investment",
        label: "Initial Investment",
        type: "currency",
        min: 0,
        max: 1000000,
        step: 1000,
        default: 50000,
        help: "Upfront cost",
      },
    ],
    returns: [
      {
        key: "annual_savings",
        label: "Annual Savings",
        type: "currency",
        min: 0,
        max: 5000000,
        step: 1000,
        default: 150000,
        help: "Direct savings per year",
      },
    ],
    formulas: [
      { key: "annual_cost", label: "Annual Investment", expression: "investment" },
      { key: "annual_gain", label: "Annual Gain", expression: "annual_savings" },
    ],
    outputs: [],
    scenarios: { conservative: 0.75, expected: 1, optimistic: 1.25 },
    is_builtin: true,
    sort_order: 99,
  },
];

function defaultsFor(t: Template): Record<string, number> {
  const out: Record<string, number> = {};
  [...t.parameters, ...t.returns].forEach((f) => {
    out[f.key] = f.default;
  });
  return out;
}

function createLocalDeal(t: Template): Deal {
  const now = new Date().toISOString();
  return {
    id: `local-${now}`,
    name: "Untitled Deal",
    template_id: t.id,
    prospect_company: null,
    prospect_logo_url: null,
    color_theme: t.color_theme,
    scenario: "expected",
    values: defaultsFor(t),
    template_snapshot: null,
    ai_summary: null,
    ai_talking_points: null,
    report: null,
    prospect_brand: null,
    created_at: now,
    updated_at: now,
  };
}

function dealTemplatePatch(t: Template) {
  return t.is_builtin
    ? { template_id: null, template_snapshot: t as never }
    : { template_id: t.id, template_snapshot: null };
}

function restoreCoreRoiFormulas(template: Template, base: Template): Template {
  const formulas = [...(template.formulas ?? [])];
  for (const key of ["annual_cost", "annual_gain"] as const) {
    if (!formulas.some((f) => f.key === key)) {
      const baseFormula = base.formulas.find((f) => f.key === key);
      if (baseFormula) formulas.push(baseFormula);
    }
  }
  return formulas === template.formulas ? template : { ...template, formulas };
}

function Page() {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [scenario, setScenario] = useState<ScenarioKey>("expected");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showDealsPicker, setShowDealsPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [researchCollapsed, setResearchCollapsed] = useState(false);
  const [researchSheetOpen, setResearchSheetOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("roi-guide-seen")) {
        setShowGuide(true);
        localStorage.setItem("roi-guide-seen", "1");
      }
    } catch {}
  }, []);
  const exportRef = useRef<HTMLDivElement>(null);

  // Apply selected brand theme to CSS variables (affects whole app)
  useEffect(() => {
    const theme = getBrandTheme(deal?.color_theme);
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--ring", theme.primary);
    root.style.setProperty("--gradient-results", theme.gradient);
    root.style.setProperty("--brand-from", theme.from);
    root.style.setProperty("--brand-to", theme.to);
  }, [deal?.color_theme]);

  // Load prospect brand fonts via Google Fonts and expose as CSS vars
  useEffect(() => {
    const brand = (deal?.prospect_brand ?? null) as
      | { headingFont?: string | null; bodyFont?: string | null }
      | null;
    const root = document.documentElement;
    const heading = brand?.headingFont?.trim();
    const body = brand?.bodyFont?.trim();
    root.style.setProperty("--brand-heading-font", heading ? `"${heading}"` : "");
    root.style.setProperty("--brand-body-font", body ? `"${body}"` : "");
    const families = [heading, body].filter(Boolean) as string[];
    if (!families.length) return;
    const id = "prospect-brand-fonts";
    const href = `https://fonts.googleapis.com/css2?${families
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
      .join("&")}&display=swap`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [deal?.prospect_brand]);

  // Load templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      try {
        // Seed default templates on first login so each user starts with a library.
        const { count } = await supabase
          .from("templates")
          .select("id", { count: "exact", head: true });
        if ((count ?? 0) === 0) {
          const rows = BUILTIN_TEMPLATES.map(({ id: _id, ...t }) => ({
            name: t.name,
            description: t.description,
            industry: t.industry,
            icon: t.icon,
            color_theme: t.color_theme,
            parameters: t.parameters as never,
            returns: t.returns as never,
            formulas: t.formulas as never,
            outputs: t.outputs as never,
            scenarios: t.scenarios as never,
            is_builtin: true,
            sort_order: t.sort_order,
          }));
          await supabase.from("templates").insert(rows as never);
        }
        const { data, error } = await supabase
          .from("templates")
          .select("*")
          .order("sort_order")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as unknown as Template[];
        return rows.length ? rows : BUILTIN_TEMPLATES;
      } catch (error) {
        console.warn("Template storage unavailable; using built-in templates.", error);
        return BUILTIN_TEMPLATES;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  // List of recent deals (drafts) for the deals picker
  const { data: dealsList = [], refetch: refetchDeals } = useQuery({
    queryKey: ["deals-list"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("deals")
          .select("id,name,prospect_company,updated_at,report,template_id,template_snapshot,color_theme")
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return (data ?? []) as unknown as Array<
          Pick<Deal, "id" | "name" | "prospect_company" | "updated_at" | "report" | "template_id" | "template_snapshot" | "color_theme">
        >;
      } catch (error) {
        console.warn("Deals list unavailable.", error);
        return [];
      }
    },
    retry: false,
    staleTime: 10_000,
  });

  // Load most recent deal or create one
  useEffect(() => {
    if (!templates.length || deal) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("deals")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          const d = data as unknown as Deal;
          const snapshot = d.template_snapshot as Template | null;
          const base =
            templates.find((tt) => tt.id === d.template_id) ??
            templates.find((tt) => tt.id === snapshot?.id) ??
            templates[0];
          // Auto-migrate stale built-in deals whose snapshot predates the current
          // built-in field set (e.g. old hours_saved_per_user defaults).
          const builtin = BUILTIN_TEMPLATES.find((b) => b.id === d.template_id || b.id === snapshot?.id);
          const snapshotKeys = snapshot
            ? new Set([...(snapshot.parameters ?? []), ...(snapshot.returns ?? [])].map((f) => f.key))
            : null;
          const builtinKeys = builtin
            ? new Set([...builtin.parameters, ...builtin.returns].map((f) => f.key))
            : null;
          const isStale =
            !!builtin &&
            !!snapshotKeys &&
            !!builtinKeys &&
            [...builtinKeys].some((k) => !snapshotKeys.has(k));
          if (isStale && builtin) {
            const migratedValues = { ...defaultsFor(builtin), ...(d.values || {}) };
            for (const field of [...builtin.parameters, ...builtin.returns]) {
              if (!snapshotKeys.has(field.key)) migratedValues[field.key] = field.default;
            }
            setDeal({ ...d, template_snapshot: null, values: migratedValues });
            setTemplate(builtin);
            setScenario(d.scenario);
            // Persist migration
            if (!d.id.startsWith("local-")) {
              supabase
                .from("deals")
                .update({ template_snapshot: null, values: migratedValues } as never)
                .eq("id", d.id)
                .then(() => {});
            }
            return;
          }
          setDeal(d);
          // If the deal has a template_snapshot with edits, use it as the active template
          const t = restoreCoreRoiFormulas(snapshot || base, base);
          setTemplate(t);
          setScenario(d.scenario);
          return;
        }
        const t = templates[0];
        const { data: newDeal, error } = await supabase
          .from("deals")
          .insert({
            ...dealTemplatePatch(t),
            values: defaultsFor(t),
            color_theme: getPreferredBrandColor(),
            name: "Untitled Deal",
          })
          .select()
          .single();
        if (!error && newDeal) {
          setDeal(newDeal as unknown as Deal);
          setTemplate(t);
          return;
        }
        throw error ?? new Error("Could not create initial deal");
      } catch (error) {
        console.warn("Deal storage unavailable; starting locally.", error);
        const t = templates[0];
        setDeal(createLocalDeal(t));
        setTemplate(t);
      }
    })();
  }, [templates, deal]);

  const computed = useMemo(() => {
    if (!template || !deal) return null;
    const mult = template.scenarios[scenario] ?? 1;
    return compute(template, deal.values || {}, mult);
  }, [template, deal, scenario]);

  // Auto-save (debounced)
  const saveTimer = useRef<number | null>(null);
  const persist = useCallback(
    (patch: Partial<Deal>) => {
      if (!deal) return;
      setDeal((prev) => (prev ? { ...prev, ...patch } : prev));
      if (deal.id.startsWith("local-")) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await supabase
          .from("deals")
          .update(patch as never)
          .eq("id", deal.id);
      }, 350);
    },
    [deal],
  );

  const setValue = (key: string, v: number) => {
    if (!deal) return;
    persist({ values: { ...(deal.values || {}), [key]: v } });
  };

  const switchTemplate = async (t: Template) => {
    if (!deal) return;
    setTemplate(t);
    persist({
      ...dealTemplatePatch(t),
      values: defaultsFor(t),
      color_theme: getPreferredBrandColor(),
    });
    setShowTemplatePicker(false);
  };

  // Edit fields/labels of the active template — persisted per-deal as a snapshot.
  const editTemplate = useCallback(
    (patch: Partial<Template>) => {
      setTemplate((prev) => {
        if (!prev) return prev;
        const next = restoreCoreRoiFormulas({ ...prev, ...patch } as Template, prev);
        persist({ template_snapshot: next as never });
        return next;
      });
    },
    [persist],
  );

  const newDeal = async () => {
    if (!template) return;
    try {
      const { data, error } = await supabase
        .from("deals")
        .insert({
          ...dealTemplatePatch(template),
          values: defaultsFor(template),
          name: "Untitled Deal",
          color_theme: getPreferredBrandColor(),
        })
        .select()
        .single();
      if (error) throw error;
      if (data) setDeal(data as unknown as Deal);
    } catch (error) {
      console.warn("Deal storage unavailable; creating local deal.", error);
      setDeal(createLocalDeal(template));
    }
    refetchDeals();
    setShowDealsPicker(false);
    toast.success("New deal created");
  };

  const switchDeal = async (id: string) => {
    if (!id || id === deal?.id) {
      setShowDealsPicker(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      const d = data as unknown as Deal;
      const snapshot = d.template_snapshot as Template | null;
      const base =
        templates.find((tt) => tt.id === d.template_id) ??
        templates.find((tt) => tt.id === snapshot?.id) ??
        templates[0];
      setDeal(d);
      setTemplate(restoreCoreRoiFormulas(snapshot || base, base));
      setScenario(d.scenario);
    } catch (e) {
      toast.error("Could not open that deal");
      console.warn(e);
    }
    setShowDealsPicker(false);
  };

  const deleteDeal = async (id: string) => {
    if (!id) return;
    if (!window.confirm("Delete this deal? This can't be undone.")) return;
    try {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deal deleted");
      if (id === deal?.id) {
        // Reload most recent remaining deal, or create a fresh one
        const { data } = await supabase
          .from("deals")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          const d = data as unknown as Deal;
          const snapshot = d.template_snapshot as Template | null;
          const base =
            templates.find((tt) => tt.id === d.template_id) ??
            templates.find((tt) => tt.id === snapshot?.id) ??
            templates[0];
          setDeal(d);
          setTemplate(restoreCoreRoiFormulas(snapshot || base, base));
          setScenario(d.scenario);
        } else if (template) {
          await newDeal();
        }
      }
      refetchDeals();
    } catch (e) {
      toast.error("Could not delete deal");
      console.warn(e);
    }
  };

  const saveTemplate = async (input: { name: string; description: string }) => {
    if (!template || !deal) return;
    const newTpl = {
      name: input.name,
      description: input.description || `Custom template based on ${template.name}`,
      industry: template.industry,
      icon: template.icon,
      color_theme: template.color_theme,
      parameters: template.parameters.map((f) => ({
        ...f,
        default: deal.values[f.key] ?? f.default,
      })),
      returns: template.returns.map((f) => ({ ...f, default: deal.values[f.key] ?? f.default })),
      formulas: template.formulas,
      outputs: template.outputs,
      scenarios: template.scenarios,
      is_builtin: false,
      sort_order: 50,
    };
    const { data: inserted, error } = await supabase
      .from("templates")
      .insert(newTpl as never)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const savedTemplate = inserted as unknown as Template;
    setTemplate(savedTemplate);
    persist({
      template_id: savedTemplate.id,
      template_snapshot: null,
      color_theme: savedTemplate.color_theme,
    });
    toast.success("Template saved");
    setShowSaveTemplate(false);
    await refetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted "${tpl.name}"`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await supabase.from("templates").insert({
            name: tpl.name,
            description: tpl.description,
            industry: tpl.industry,
            icon: tpl.icon,
            color_theme: tpl.color_theme,
            parameters: tpl.parameters,
            returns: tpl.returns,
            formulas: tpl.formulas,
            outputs: tpl.outputs,
            scenarios: tpl.scenarios,
            is_builtin: false,
            sort_order: tpl.sort_order,
          } as never);
          refetchTemplates();
        },
      },
    });
    refetchTemplates();
  };

  // PDF export now lives inside <ReportEditor /> so the user can edit before export.

  if (!template || !deal || !computed) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <div className="flex items-center gap-2 text-sm font-mono">
          <Loader2 className="size-4 animate-spin" /> Initializing engine
        </div>
      </div>
    );
  }

  const TplIcon = ICONS[template.icon || "cloud"] ?? Cloud;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">
      {/* Top Bar */}
      <nav className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 sm:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
          <div className="flex items-center gap-2.5 shrink-0">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="block h-9 w-9 select-none shrink-0"
              style={{ color: "var(--brand-from)" }}
            >
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-black tracking-[-0.02em] text-[15px] text-foreground">
                ROI<span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(90deg, var(--brand-from), var(--brand-to))" }}
                >.</span>
              </span>
              <span className="mt-[3px] font-medium uppercase text-[8.5px] tracking-[0.22em] text-muted-foreground">
                SALES COMPANION
              </span>
            </div>
          </div>
          <div className="hidden sm:block h-4 w-px bg-border" />
          <div className="relative min-w-0 flex-1 sm:flex-initial">
            <button
              onClick={() => setShowTemplatePicker((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium hover:text-primary transition-colors group max-w-full"
            >
              <span className="text-muted-foreground hidden lg:inline">Template:</span>
              <TplIcon className="size-3.5 shrink-0" />
              <span className="truncate min-w-0">{template.name}</span>
              <ChevronDown className="size-3 shrink-0 transition-transform group-hover:translate-y-px" />
            </button>
            <AnimatePresence>
              {showTemplatePicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 top-full mt-2 w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card shadow-lift z-50 overflow-hidden"
                >
                  <div className="p-2 max-h-96 overflow-y-auto scrollbar-thin">
                    {templates.map((t) => {
                      const I = ICONS[t.icon || "cloud"] ?? Cloud;
                      const active = t.id === template.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => switchTemplate(t)}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-accent transition",
                            active && "bg-accent",
                          )}
                        >
                          <I className="size-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{t.name}</span>
                              {t.is_builtin && (
                                <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted">
                                  Built-in
                                </span>
                              )}
                            </div>
                            {t.description && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {t.description}
                              </div>
                            )}
                          </div>
                          {!t.is_builtin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTemplate(t.id);
                              }}
                              className="shrink-0 text-muted-foreground/60 hover:text-destructive transition p-1 rounded hover:bg-destructive/10"
                              aria-label="Delete template"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-border bg-muted/30 px-2 py-1.5">
                    <button
                      onClick={() => {
                        setShowTemplatePicker(false);
                        setShowSaveTemplate(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition"
                    >
                      <Save className="size-3.5" /> Save current as template…
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Deals (drafts) picker */}
          <div className="hidden sm:block h-4 w-px bg-border" />
          <div className="relative shrink-0">
            <div className="flex items-center gap-1.5 group">
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={deal?.name ?? ""}
                onChange={(e) => persist({ name: e.target.value })}
                placeholder="Untitled Deal"
                aria-label="Deal name"
                spellCheck={false}
                className="hidden md:inline-block bg-transparent text-xs font-medium w-[10rem] truncate rounded px-1.5 py-1 -mx-1 border border-transparent hover:border-border focus:border-primary focus:outline-none focus:bg-background transition-colors"
              />
              <button
                onClick={() => {
                  setShowDealsPicker((v) => {
                    if (!v) refetchDeals();
                    return !v;
                  });
                }}
                aria-label="Open deals"
                className="p-0.5 rounded hover:bg-accent transition-colors"
              >
                <ChevronDown className="size-3 shrink-0" />
              </button>
            </div>
            <AnimatePresence>
              {showDealsPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 top-full mt-2 w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card shadow-lift z-50 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Drafts · auto-saved
                    </span>
                    <button
                      onClick={newDeal}
                      className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <Plus className="size-3" /> New deal
                    </button>
                  </div>
                  <div className="p-1.5 max-h-96 overflow-y-auto scrollbar-thin">
                    {dealsList.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No drafts yet. Your work auto-saves here.
                      </div>
                    )}
                    {dealsList.map((d) => {
                      const active = d.id === deal?.id;
                      const hasReport = !!d.report && Object.keys(d.report as object).length > 0;
                      const when = d.updated_at
                        ? new Date(d.updated_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "";
                      return (
                        <div
                          key={d.id}
                          onClick={() => switchDeal(d.id)}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-accent transition",
                            active && "bg-accent",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {d.name || "Untitled Deal"}
                              </span>
                              {active && (
                                <CheckCircle2 className="size-3 text-primary shrink-0" />
                              )}
                              {hasReport && (
                                <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-primary/80 px-1.5 py-0.5 rounded bg-primary/10">
                                  Report
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {d.prospect_company || "No prospect"} · {when}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDeal(d.id);
                            }}
                            className="shrink-0 text-muted-foreground/60 hover:text-destructive transition p-1 rounded hover:bg-destructive/10"
                            aria-label="Delete deal"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => setResearchSheetOpen(true)}
            aria-label="Open company research"
            className="lg:hidden flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium border border-border rounded-full hover:bg-accent transition active:scale-95"
          >
            <Search className="size-3.5" /> <span className="hidden lg:inline">Research</span>
          </button>
          <button
            onClick={() => setShowGuide(true)}
            aria-label="Start here guide"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition active:scale-95 shadow-primary"
          >
            <HelpCircle className="size-3.5" /> <span className="hidden md:inline">Start here</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="flex items-center justify-center size-8 rounded-full hover:bg-accent transition"
          >
            <SettingsIcon className="size-4" />
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.assign("/auth");
            }}
            aria-label="Sign out"
            title="Sign out"
            className="flex items-center justify-center size-8 rounded-full hover:bg-accent transition"
          >
            <LogOut className="size-4" />
          </button>
          <button
            onClick={() => setShowReport(true)}
            aria-label="Build report"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-full hover:bg-foreground/90 transition active:scale-95"
          >
            <FileDown className="size-3.5" /> <span className="hidden lg:inline">Build Report</span>
          </button>
        </div>
      </nav>

      {/* Main split-pane (desktop) / stacked (mobile/tablet) */}
      <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
        <div className="flex-1 min-w-0 h-full">
          <div ref={exportRef} data-lenis-prevent className="h-full overflow-y-auto scrollbar-thin">
            <Calculator
              template={template}
              deal={deal}
              computed={computed}
              scenario={scenario}
              setScenario={setScenario}
              setValue={setValue}
              persist={persist}
              editTemplate={editTemplate}
            />
          </div>
        </div>
        {/* Inline research panel — desktop only */}
        <motion.div
          initial={false}
          animate={{ width: researchCollapsed ? 44 : 420 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:block h-full border-l border-border bg-surface shrink-0 overflow-hidden relative"
        >
          <ResearchPanel
            deal={deal}
            persist={persist}
            setValue={setValue}
            templates={templates}
            switchTemplate={switchTemplate}
            collapsed={researchCollapsed}
            onToggle={() => setResearchCollapsed((v) => !v)}
          />
        </motion.div>
      </div>

      {/* Research as side sheet on mobile/tablet */}
      <Sheet open={researchSheetOpen} onOpenChange={setResearchSheetOpen}>
        <SheetContent
          side="right"
          className="p-0 w-[min(420px,100vw)] sm:max-w-[420px] bg-surface border-l border-border lg:hidden"
        >
          <ResearchPanel
            deal={deal}
            persist={persist}
            setValue={setValue}
            templates={templates}
            switchTemplate={switchTemplate}
            collapsed={false}
            onToggle={() => setResearchSheetOpen(false)}
            inSheet
          />
        </SheetContent>
      </Sheet>

      <Sheet open={showGuide} onOpenChange={setShowGuide}>
        <SheetContent
          side="right"
          data-lenis-prevent
          className="p-0 w-[min(520px,100vw)] sm:max-w-[520px] bg-surface border-l border-border overflow-y-auto overscroll-contain scrollbar-thin"
        >
          <StartHereGuide onClose={() => setShowGuide(false)} />
        </SheetContent>
      </Sheet>

      <AnimatePresence>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showReport && (
          <ReportEditor
            deal={deal}
            template={template}
            computed={computed}
            scenario={scenario}
            persist={persist}
            onClose={() => setShowReport(false)}
          />
        )}
        {showSaveTemplate && (
          <SaveTemplateModal
            template={template}
            baseTemplate={templates.find((tt) => tt.id === deal.template_id) ?? null}
            onClose={() => setShowSaveTemplate(false)}
            onSave={saveTemplate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── Calculator ─────────────── */

function Calculator({
  template,
  deal,
  computed,
  scenario,
  setScenario,
  setValue,
  persist,
  editTemplate,
}: {
  template: Template;
  deal: Deal;
  computed: ReturnType<typeof compute>;
  scenario: ScenarioKey;
  setScenario: (s: ScenarioKey) => void;
  setValue: (k: string, v: number) => void;
  persist: (p: Partial<Deal>) => void;
  editTemplate: (p: Partial<Template>) => void;
}) {
  const [genLoading, setGenLoading] = useState(false);
  const generateSummaryFn = useServerFn(generateSummary);

  const handleGenerate = async () => {
    setGenLoading(true);
    try {
      const r = await generateSummaryFn({
        data: {
          prospectCompany: deal.prospect_company || "the prospect",
          templateName: template.name,
          scenario,
          metrics: {
            annualCost: computed.annualCost,
            annualGain: computed.annualGain,
            threeYearValue: computed.threeYearValue,
            paybackMonths: Number.isFinite(computed.paybackMonths) ? computed.paybackMonths : 0,
            roiPercent: computed.roiPercent,
          },
        },
      });
      persist({ ai_summary: r.summary, ai_talking_points: r.talking_points });
      toast.success("Executive summary generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="max-w-6xl mx-auto space-y-10 sm:space-y-12">
        {/* Header */}
        <header className="text-center space-y-3 max-w-3xl mx-auto">
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tighter"
            style={{ fontFamily: 'Urbanist, system-ui, -apple-system, sans-serif' }}
          >
            Calculate your <span className="text-primary">potential</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground text-balance">
            Estimate the return on investment for your solution. Adjust parameters to see projected savings.
          </p>
        </header>

        {/* Two-column workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(380px,440px)] gap-6">
          {/* Left: stacked inputs */}
          <div className="space-y-6 min-w-0">
            <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 sm:p-7 shadow-card">
              <FieldSection
                title="Investment Parameters"
                fields={template.parameters}
                allFields={[...template.parameters, ...template.returns]}
                formulas={template.formulas}
                scope={computed.scope}
                values={deal.values}
                onChange={setValue}
                onEditFields={(next) => editTemplate({ parameters: next })}
                onEditFormulas={(next) => editTemplate({ formulas: next })}
                kind="parameter"
              />
            </div>
            <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 sm:p-7 shadow-card">
              <FieldSection
                title="Projected Returns"
                fields={template.returns}
                allFields={[...template.parameters, ...template.returns]}
                formulas={template.formulas}
                scope={computed.scope}
                values={deal.values}
                onChange={setValue}
                onEditFields={(next) => editTemplate({ returns: next })}
                onEditFormulas={(next) => editTemplate({ formulas: next })}
                kind="return"
              />
            </div>
          </div>

          {/* Right: sticky results card */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ResultsCard
              template={template}
              computed={computed}
              scenario={scenario}
              setScenario={setScenario}
            />
          </div>
        </div>

        {/* Branding */}
        <BrandingSection deal={deal} persist={persist} />

        {/* AI summary + talking points */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest">Executive Summary</h3>
              <button
                onClick={handleGenerate}
                disabled={genLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-foreground text-background rounded-full hover:bg-foreground/90 transition active:scale-95 disabled:opacity-60"
              >
                {genLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Wand2 className="size-3" />
                )}
                {deal.ai_summary ? "Regenerate" : "Generate"}
              </button>
            </div>
            <div className="text-sm leading-relaxed text-muted-foreground text-pretty min-h-[6rem]">
              {deal.ai_summary || (
                <span className="italic text-muted-foreground/70">
                  Click Generate to draft a board-ready summary using your current numbers.
                </span>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 shadow-card space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest">Talking Points</h3>
            {deal.ai_talking_points?.length ? (
              <ul className="space-y-2.5">
                {deal.ai_talking_points.map((p, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex gap-2 text-sm"
                  >
                    <span className="text-primary mt-0.5">→</span>
                    <span className="text-foreground/85">{p}</span>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <div className="text-sm italic text-muted-foreground/70">
                Generate to get punchy objection-handlers and value props.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioPicker({
  value,
  onChange,
}: {
  value: ScenarioKey;
  onChange: (s: ScenarioKey) => void;
}) {
  return (
    <div className="relative flex gap-1 bg-muted p-1 rounded-lg">
      {SCENARIOS.map((s) => {
        const active = s.key === value;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={cn(
              "relative px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors z-10",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.div
                layoutId="scenario-pill"
                className="absolute inset-0 bg-card rounded-md ring-1 ring-black/5 shadow-sm -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueRaw,
  num,
  accent,
}: {
  label: string;
  value?: string;
  valueRaw?: string;
  num?: number;
  accent?: boolean;
}) {
  return (
    <motion.div
      layout
      className="p-5 ring-1 ring-black/5 bg-card rounded-xl space-y-2 shadow-card hover:shadow-lift transition-shadow"
    >
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className={cn("text-2xl font-bold tabular-nums", accent && "text-primary")}>
        {valueRaw ??
          (typeof num === "number" ? (
            <AnimatedNumber
              value={num}
              format={(n) => formatCurrency(n, { compact: n >= 1_000_000 })}
            />
          ) : (
            value
          ))}
      </p>
    </motion.div>
  );
}

function ResultsCard({
  template,
  computed,
  scenario,
  setScenario,
}: {
  template: Template;
  computed: ReturnType<typeof compute>;
  scenario: ScenarioKey;
  setScenario: (s: ScenarioKey) => void;
}) {
  const total = computed.annualGain + computed.annualCost;
  const costPct = total > 0 ? (computed.annualCost / total) * 100 : 50;
  const paybackLabel = Number.isFinite(computed.paybackMonths)
    ? `${computed.paybackMonths < 12 ? computed.paybackMonths.toFixed(1) : Math.round(computed.paybackMonths)} months`
    : "—";
  const isFast = Number.isFinite(computed.paybackMonths) && computed.paybackMonths <= 12;

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white shadow-lift ring-1 ring-white/5"
      style={{ background: "var(--gradient-results)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
          Analysis Results
        </span>
        <BarChart3 className="size-4 text-white/40" />
      </div>

      <LayoutGroup id="results-scenario">
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] mb-7">
          {SCENARIOS.map((s) => {
            const active = s.key === scenario;
            const mult = Math.round((template.scenarios[s.key] ?? 1) * 100);
            const Icon = s.key === "conservative" ? ShieldCheck : s.key === "expected" ? BarChart3 : TrendingUp;
            return (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                className={cn(
                  "relative flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 text-[11px] font-semibold rounded-lg transition-colors z-10",
                  active ? "text-white" : "text-white/55 hover:text-white/80",
                )}
              >
                {active && (
                  <motion.div
                    layoutId="results-scenario-pill"
                    className="absolute inset-0 bg-white/[0.08] ring-1 ring-white/10 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{s.label}</span>
                <span className={cn(
                  "shrink-0 px-1 py-0.5 text-[9px] font-mono rounded",
                  active ? "bg-primary/40 text-white" : "bg-white/[0.06] text-white/50",
                )}>
                  {mult}%
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div className="text-center mb-7">
        <div className="flex items-baseline justify-center">
          <span className="text-6xl sm:text-7xl font-bold tracking-tighter tabular-nums">
            <AnimatedNumber
              value={computed.roiPercent}
              format={(n) => formatNumber(Math.max(-999, Math.min(99999, n)))}
            />
          </span>
          <span className="text-3xl sm:text-4xl font-bold ml-1" style={{ color: "var(--metric-accent)" }}>%</span>
        </div>
        <p className="mt-1 text-xs text-white/55">Total Return on Investment</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] p-4">
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">Annual Savings</span>
          <p className="mt-1.5 text-xl font-bold tabular-nums" style={{ color: "var(--metric-accent)" }}>
            <AnimatedNumber
              value={computed.annualGain}
              format={(n) => formatCurrency(n, { compact: n >= 1_000_000 })}
            />
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] p-4">
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">3-Year Value</span>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-white">
            <AnimatedNumber
              value={computed.threeYearValue}
              format={(n) => formatCurrency(n, { compact: true })}
            />
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] p-4 mb-5 flex items-center justify-between">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">Payback Period</span>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-white">{paybackLabel}</p>
        </div>
        {isFast && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
            <TrendingUp className="size-3" /> Fast
          </span>
        )}
      </div>

      <div>
        <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-white/50 mb-2">
          <span>Cost</span>
          <span>Gain</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
          <div className="h-full bg-white/30" style={{ width: `${costPct}%` }} />
          <div className="h-full" style={{ width: `${100 - costPct}%`, background: "var(--metric-accent)" }} />
        </div>
        <p className="mt-4 text-center text-[11px] text-white/45 italic">
          Expected outcome based on typical implementation
        </p>
      </div>
    </div>
  );
}

function slugifyKey(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  let key = base;
  let i = 2;
  while (existing.includes(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}

function FieldSection({
  title,
  fields,
  allFields,
  formulas,
  scope,
  values,
  onChange,
  onEditFields,
  onEditFormulas,
  kind,
}: {
  title: string;
  fields: Field[];
  allFields: Field[];
  formulas: Formula[];
  scope: Record<string, number>;
  values: Record<string, number>;
  onChange: (k: string, v: number) => void;
  onEditFields: (next: Field[]) => void;
  onEditFormulas: (next: Formula[]) => void;
  kind: "parameter" | "return";
}) {
  const updateField = (idx: number, patch: Partial<Field>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onEditFields(next);
  };
  const removeField = (idx: number) => {
    const removed = fields[idx];
    onEditFields(fields.filter((_, i) => i !== idx));
    if (removed) {
      onEditFormulas(
        formulas.flatMap((f) => {
          if (f.key === removed.key) return [];
          if (ROLE_FORMULA_KEYS.has(f.key)) {
            return [{ ...f, expression: removeAdditiveTerm(f.expression, removed.key) }];
          }
          return referencesIdentifier(f.expression, removed.key) ? [] : [f];
        }),
      );
    }
  };
  const addField = () => {
    const label = kind === "parameter" ? "New parameter" : "New return";
    const key = slugifyKey(label, [...allFields.map((f) => f.key), ...formulas.map((f) => f.key)]);
    const newField: Field = {
      key,
      label,
      type: "number",
      min: 0,
      max: 1000,
      step: 1,
      default: 0,
    };
    onEditFields([...fields, newField]);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
      <div className="space-y-7">
        <AnimatePresence initial={false}>
          {fields.map((f, idx) => (
            <motion.div
              key={f.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <FieldControl
                field={f}
                value={values[f.key] ?? f.default}
                allFields={allFields}
                formulas={formulas}
                scope={scope}
                onChange={(v) => onChange(f.key, v)}
                onLabelChange={(label) => updateField(idx, { label })}
                onTypeChange={(type) => updateField(idx, { type })}
                onEditFormulas={onEditFormulas}
                onRemove={() => removeField(idx)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          onClick={addField}
          className="group flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
        >
          <span className="grid place-items-center size-4 rounded border border-dashed border-muted-foreground/40 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Plus className="size-2.5" strokeWidth={3} />
          </span>
          Add {kind}
        </button>
      </div>
    </div>
  );
}

type BinOp = "+" | "-" | "*" | "/";
const OP_LABEL: Record<BinOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function parseBinary(expr: string): { a: string; op: BinOp; b: string } | null {
  const m = expr?.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([+\-*/])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
  return m ? { a: m[1], op: m[2] as BinOp, b: m[3] } : null;
}
function isSingleId(expr: string): string | null {
  const m = expr?.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
  return m ? m[1] : null;
}

const ROLE_FORMULA_KEYS = new Set(["annual_cost", "annual_gain"]);

function FormattedNumberInput({
  fieldType,
  unit,
  value,
  min,
  step,
  readOnly,
  onCommit,
  className,
}: {
  fieldType: import("@/lib/types").FieldType;
  unit?: string;
  value: number;
  min: number;
  step: number;
  readOnly?: boolean;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const safe = Number.isFinite(value) ? value : 0;

  const formatted =
    fieldType === "currency"
      ? `$${formatNumber(safe, safe % 1 === 0 ? 0 : 2)}`
      : fieldType === "percent"
        ? `${formatNumber(safe, safe % 1 === 0 ? 0 : 1)}%`
        : `${formatNumber(safe, safe % 1 === 0 ? 0 : 2)}${unit ? ` ${unit}` : ""}`;

  const display = focused ? draft : formatted;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      readOnly={readOnly}
      onFocus={() => {
        setFocused(true);
        setDraft(String(Number(safe.toFixed(2))));
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = Number(draft.replace(/[^0-9.-]/g, ""));
        onCommit(Number.isFinite(parsed) ? Math.max(min, parsed) : min);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onCommit(safe + step);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onCommit(Math.max(min, safe - step));
        }
      }}
      className={className}
    />
  );
}

function FieldControl({
  field,
  value,
  allFields,
  formulas,
  scope,
  onChange,
  onLabelChange,
  onTypeChange,
  onEditFormulas,
  onRemove,
}: {
  field: Field;
  value: number;
  allFields: Field[];
  formulas: Formula[];
  scope: Record<string, number>;
  onChange: (v: number) => void;
  onLabelChange: (label: string) => void;
  onTypeChange: (type: Field["type"]) => void;
  onEditFormulas: (next: Formula[]) => void;
  onRemove: () => void;
}) {
  const min = field.min ?? 0;
  const baseMax = field.max ?? 1000000;
  const step = field.step ?? 1;

  const fieldFormula = formulas.find((f) => f.key === field.key) || null;
  const isComputed = !!fieldFormula;
  const displayValue = isComputed ? Number(scope[field.key]) || 0 : value;
  const max = Math.max(baseMax, displayValue);
  const pct = ((displayValue - min) / (max - min || 1)) * 100;

  const costExpr = formulas.find((f) => f.key === "annual_cost")?.expression || "";
  const gainExpr = formulas.find((f) => f.key === "annual_gain")?.expression || "";
  const role: "none" | "cost" | "gain" = hasAdditiveTerm(costExpr, field.key)
    ? "cost"
    : hasAdditiveTerm(gainExpr, field.key)
      ? "gain"
      : "none";

  const otherFields = allFields.filter((f) => f.key !== field.key);

  const upsertFormula = (key: string, expression: string | null) => {
    const without = formulas.filter((f) => f.key !== key);
    onEditFormulas(expression === null ? without : [...without, { key, label: key, expression }]);
  };

  const setRole = (next: "none" | "cost" | "gain") => {
    onEditFormulas(setFormulaRole(formulas, field.key, next));
  };

  const toggleComputed = (computed: boolean) => {
    if (!computed) {
      upsertFormula(field.key, null);
      return;
    }
    // Seed with first two other fields (or one if only one available)
    const a = otherFields[0]?.key;
    const b = otherFields[1]?.key;
    if (a && b) upsertFormula(field.key, `${a} * ${b}`);
    else if (a) upsertFormula(field.key, a);
  };

  const bin = fieldFormula ? parseBinary(fieldFormula.expression) : null;
  const single = fieldFormula ? isSingleId(fieldFormula.expression) : null;

  const updateBin = (patch: Partial<{ a: string; op: BinOp; b: string }>) => {
    const cur = bin || {
      a: otherFields[0]?.key || field.key,
      op: "*" as BinOp,
      b: otherFields[1]?.key || field.key,
    };
    const next = { ...cur, ...patch };
    upsertFormula(field.key, `${next.a} ${next.op} ${next.b}`);
  };

  const display =
    field.type === "currency"
      ? formatCurrency(displayValue)
      : field.type === "percent"
        ? `${formatNumber(displayValue, displayValue % 1 === 0 ? 0 : 1)}%`
        : `${formatNumber(displayValue, displayValue % 1 === 0 ? 0 : 1)}${field.unit ? ` ${field.unit}` : ""}`;

  return (
    <div className="space-y-3 group">
      <div className="flex justify-between items-baseline gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <input
            value={field.label}
            onChange={(e) => onLabelChange(e.target.value)}
            title={field.help || "Click to rename"}
            className="text-[13px] font-mono uppercase text-foreground tracking-wider bg-transparent border border-transparent rounded px-1 -mx-1 hover:border-border focus:border-primary focus:outline-none transition-colors min-w-0 flex-1 truncate"
          />
          {isComputed && (
            <span
              title="Computed from a formula"
              className="shrink-0 grid place-items-center size-4 rounded bg-primary/10 text-primary"
            >
              <Sigma className="size-2.5" strokeWidth={3} />
            </span>
          )}
          {role !== "none" && (
            <span className="shrink-0 px-1 py-px text-[8px] font-bold uppercase tracking-wider rounded bg-foreground/5 text-muted-foreground">
              {role === "cost" ? "Cost" : "Gain"}
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Field settings"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 text-muted-foreground/60 hover:text-foreground transition shrink-0"
              >
                <SettingsIcon className="size-3" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3 space-y-3">
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Format
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(["currency", "number", "percent"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onTypeChange(t)}
                      className={cn(
                        "text-[11px] font-medium capitalize py-1.5 rounded border transition-colors",
                        field.type === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-foreground/40",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Maps to (ROI)
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["none", "None"],
                      ["cost", "Cost"],
                      ["gain", "Gain"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setRole(k)}
                      className={cn(
                        "text-[11px] font-medium py-1.5 rounded border transition-colors",
                        role === k
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-foreground/40",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Source
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => toggleComputed(false)}
                      className={cn(
                        "text-[10px] font-medium px-2 py-1 rounded border transition-colors",
                        !isComputed
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-foreground/40",
                      )}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleComputed(true)}
                      disabled={otherFields.length === 0}
                      className={cn(
                        "text-[10px] font-medium px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        isComputed
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-foreground/40",
                      )}
                    >
                      Computed
                    </button>
                  </div>
                </div>

                {isComputed && (
                  <div className="space-y-2 pt-1">
                    {bin || (!single && !bin) ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={bin?.a || otherFields[0]?.key || ""}
                          onChange={(e) => updateBin({ a: e.target.value })}
                          className="flex-1 min-w-0 text-[11px] bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {allFields
                            .filter((f) => f.key !== field.key)
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                        </select>
                        <select
                          value={bin?.op || "*"}
                          onChange={(e) => updateBin({ op: e.target.value as BinOp })}
                          className="text-[11px] bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {(["+", "-", "*", "/"] as BinOp[]).map((o) => (
                            <option key={o} value={o}>
                              {OP_LABEL[o]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={bin?.b || otherFields[1]?.key || otherFields[0]?.key || ""}
                          onChange={(e) => updateBin({ b: e.target.value })}
                          className="flex-1 min-w-0 text-[11px] bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {allFields
                            .filter((f) => f.key !== field.key)
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : single ? (
                      <select
                        value={single}
                        onChange={(e) => upsertFormula(field.key, e.target.value)}
                        className="w-full text-[11px] bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {allFields
                          .filter((f) => f.key !== field.key)
                          .map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    ) : null}
                    <details className="text-[10px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Advanced expression
                      </summary>
                      <input
                        value={fieldFormula?.expression || ""}
                        onChange={(e) => upsertFormula(field.key, e.target.value)}
                        spellCheck={false}
                        className="mt-1 w-full font-mono text-[11px] bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <p className="mt-1 text-muted-foreground">
                        Use field keys + − × ÷ ( ). e.g. <code>seats * price_per_seat</code>
                      </p>
                    </details>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onRemove}
                className="w-full mt-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="size-3" /> Remove field
              </button>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove field"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground/60 hover:text-destructive transition shrink-0"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <FormattedNumberInput
            fieldType={field.type}
            unit={field.unit}
            value={displayValue}
            min={min}
            step={step}
            readOnly={isComputed}
            onCommit={(v) => onChange(Math.max(min, v))}
            className={cn(
              "w-32 text-right bg-transparent text-foreground font-bold font-mono text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary rounded px-1",
              isComputed && "text-foreground cursor-not-allowed",
            )}
          />
          {!isComputed && (
            <div className="flex flex-col rounded-md border border-border overflow-hidden bg-card opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onChange(Math.min(max, value + step))}
                className="grid place-items-center w-5 h-3.5 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                aria-label="Increase"
              >
                <ChevronUp className="size-3" strokeWidth={2.5} />
              </button>
              <div className="h-px bg-border" />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onChange(Math.max(min, value - step))}
                className="grid place-items-center w-5 h-3.5 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                aria-label="Decrease"
              >
                <ChevronDown className="size-3" strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>
      {!isComputed && (
        <div className="relative h-1.5 bg-muted rounded-full overflow-visible cursor-pointer">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              backgroundImage:
                "linear-gradient(90deg, var(--brand-from, hsl(var(--primary))), var(--brand-to, hsl(var(--primary))))",
              boxShadow:
                "0 0 8px -1px color-mix(in oklab, var(--brand-from, #888) 50%, transparent)",
            }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-6 -top-2.5"
          />
          <motion.div
            className="absolute top-1/2 size-4 rounded-full shadow-md pointer-events-none border-2 border-background"
            style={{
              left: `${Math.max(0, Math.min(100, pct))}%`,
              transform: "translate(-50%, -50%)",
              backgroundImage:
                "linear-gradient(135deg, var(--brand-from, hsl(var(--primary))), var(--brand-to, hsl(var(--primary))))",
              boxShadow:
                "0 0 0 2px var(--background, #fff), 0 4px 12px -2px color-mix(in oklab, var(--brand-from, #888) 55%, transparent)",
            }}
            whileHover={{ scale: 1.25 }}
          />
        </div>
      )}
      <div className="flex justify-between items-center -mt-1">
        <span className="text-[10px] font-mono text-muted-foreground/60">{display}</span>
        {field.help && (
          <span className="text-[10px] text-muted-foreground/60 italic truncate max-w-[60%] text-right">
            {field.help}
          </span>
        )}
      </div>
    </div>
  );
}

function BrandingSection({ deal, persist }: { deal: Deal; persist: (p: Partial<Deal>) => void }) {
  const [uploading, setUploading] = useState(false);
  const onUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max 2MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${deal.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      persist({ prospect_logo_url: data.publicUrl });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card ring-1 ring-black/5 p-6 shadow-card grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="space-y-1.5 md:col-span-3">
        <h3 className="text-sm font-bold uppercase tracking-widest">Branding</h3>
        <p className="text-xs text-muted-foreground">Customize the deal for your prospect</p>
      </div>
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Deal Name
        </label>
        <input
          value={deal.name}
          onChange={(e) => persist({ name: e.target.value })}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Prospect Company
        </label>
        <input
          value={deal.prospect_company || ""}
          onChange={(e) => persist({ prospect_company: e.target.value })}
          placeholder="Acme Global"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Logo
        </label>
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-md text-xs cursor-pointer hover:border-primary/40 transition">
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ImagePlus className="size-3.5" />
          )}
          {deal.prospect_logo_url ? "Replace logo" : "Upload logo (PNG/SVG, ≤2MB)"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
        {deal.prospect_logo_url && (
          <img src={deal.prospect_logo_url} alt="logo" className="h-10 mt-2 object-contain" />
        )}
      </div>
      <div className="md:col-span-3 space-y-2 pt-2 border-t border-border">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Brand Color
        </label>
        <div className="flex flex-wrap gap-2">
          {BRAND_THEMES.map((t) => {
            const active = (deal.color_theme || "indigo") === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  rememberBrandColor(t.id);
                  persist({ color_theme: t.id });
                }}
                title={t.name}
                aria-label={t.name}
                className={cn(
                  "group flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition",
                  active
                    ? "border-foreground/40 bg-accent"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <span
                  className="h-6 w-6 rounded-full ring-1 ring-black/10"
                  style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                />
                <span className="text-[11px] font-medium">{t.name}</span>
              </button>
            );
          })}
          <CustomBrandPicker
            value={deal.color_theme}
            onChange={(id) => {
              rememberBrandColor(id);
              persist({ color_theme: id });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CustomBrandPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const parsed = parseCustomTheme(value);
  const active = !!parsed;
  const [from, setFrom] = useState(parsed?.from ?? "#7c3aed");
  const [to, setTo] = useState(parsed?.to ?? "#1e1b4b");

  useEffect(() => {
    const p = parseCustomTheme(value);
    if (p) {
      setFrom(p.from);
      setTo(p.to);
    }
  }, [value]);

  const apply = (nextFrom: string, nextTo: string) => {
    onChange(`custom:${nextFrom}:${nextTo}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Custom color"
          aria-label="Custom color"
          className={cn(
            "group flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition",
            active ? "border-foreground/40 bg-accent" : "border-border hover:border-foreground/20",
          )}
        >
          <span
            className="h-6 w-6 rounded-full ring-1 ring-black/10 grid place-items-center"
            style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <Plus className="size-3 text-white drop-shadow" />
          </span>
          <span className="text-[11px] font-medium">Custom</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Custom Brand Gradient
        </div>
        <div
          className="h-10 w-full rounded-md ring-1 ring-black/10"
          style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">From</span>
            <div className="flex items-center gap-1.5 border border-border rounded-md px-1.5 py-1">
              <input
                type="color"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  apply(e.target.value, to);
                }}
                className="h-6 w-6 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={from}
                onChange={(e) => {
                  const v = e.target.value;
                  setFrom(v);
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) apply(v, to);
                }}
                className="w-full bg-transparent text-xs font-mono outline-none"
              />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">To</span>
            <div className="flex items-center gap-1.5 border border-border rounded-md px-1.5 py-1">
              <input
                type="color"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  apply(from, e.target.value);
                }}
                className="h-6 w-6 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={to}
                onChange={(e) => {
                  const v = e.target.value;
                  setTo(v);
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) apply(from, v);
                }}
                className="w-full bg-transparent text-xs font-mono outline-none"
              />
            </div>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────── Research Pane ─────────────── */

function ResearchPanel({
  deal,
  persist,
  setValue,
  templates,
  switchTemplate,
  collapsed,
  onToggle,
  inSheet = false,
}: {
  deal: Deal;
  persist: (p: Partial<Deal>) => void;
  setValue: (k: string, v: number) => void;
  templates: Template[];
  switchTemplate: (t: Template) => void;
  collapsed: boolean;
  onToggle: () => void;
  inSheet?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [pitch, setPitch] = useState("");
  const [mode, setMode] = useState<"fast" | "deep">("fast");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [myCompany, setMyCompany] = useState<string>("");
  const [myProduct, setMyProduct] = useState<string>("");
  const enrichFn = useServerFn(enrichCompany);
  const brandFn = useServerFn(extractBranding);

  // Load settings
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setMyCompany(data.company_name || "");
        setMyProduct(data.product_description || "");
      }
    })();
  }, []);

  // Load latest research for this deal
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("research")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setQuery(data.query);
        setMode(data.mode as "fast" | "deep");
        setResult(data.result as unknown as ResearchResult);
      } else {
        setResult(null);
        setQuery("");
      }
    })();
  }, [deal.id]);

  const run = async () => {
    if (!query.trim()) {
      toast.error("Enter a URL or company description");
      return;
    }
    setLoading(true);
    try {
      // Always fetch fresh settings so research is grounded in the latest sales context
      const { data: s } = await supabase
        .from("user_settings")
        .select("company_name, product_description")
        .limit(1)
        .maybeSingle();
      const freshCompany = s?.company_name || myCompany;
      const freshProduct = s?.product_description || myProduct;
      if (s) {
        setMyCompany(freshCompany);
        setMyProduct(freshProduct);
      }
      if (!freshCompany || !freshProduct) {
        toast.error(
          "Set your company + product in Settings first — research needs your sales context.",
        );
        setLoading(false);
        return;
      }
      const productWithPitch = pitch.trim()
        ? `${freshProduct}\n\nSPECIFIC PITCH FOR THIS PROSPECT:\n${pitch.trim()}`
        : freshProduct;
      const [r, brandResult] = await Promise.allSettled([
        enrichFn({
          data: { query: query.trim(), mode, myCompany: freshCompany, myProduct: productWithPitch },
        }),
        brandFn({ data: { url: query.trim() } }),
      ]);
      if (r.status !== "fulfilled") {
        throw r.reason instanceof Error ? r.reason : new Error("Research failed");
      }
      const res = r.value as ResearchResult;
      setResult(res);
      await supabase.from("research").insert({
        deal_id: deal.id,
        query: query.trim(),
        mode,
        result: res as never,
      });

      // Derive a domain to use for logo fallbacks
      const domainMatch = query
        .trim()
        .match(/^(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
      const domain = domainMatch?.[1]?.toLowerCase() || null;
      const fallbackLogo = domain ? `https://logo.clearbit.com/${domain}` : null;

      // Apply prospect brand (logo, colors, fonts). Always try to save *something*.
      if (brandResult.status === "fulfilled" && brandResult.value) {
        const b = brandResult.value;
        const logo = b.logo || fallbackLogo;
        const patch: Record<string, unknown> = {
          prospect_brand: { ...b, logo } as never,
        };
        if (logo && !deal.prospect_logo_url) patch.prospect_logo_url = logo;
        // NOTE: intentionally do NOT overwrite deal.color_theme here.
        // color_theme drives the global app chrome (--primary, --ring,
        // gradients). The prospect's colors live on prospect_brand and
        // should only theme the report surface, not the whole UI.
        persist(patch as never);
        toast.success(b.logo ? "Brand pulled in from site" : "Logo guessed from domain");
      } else {
        // Firecrawl failed — still try to save a logo guess so the report isn't bare
        console.warn("extractBranding failed:", brandResult.status === "rejected" ? brandResult.reason : "no value");
        if (fallbackLogo && !deal.prospect_logo_url) {
          persist({
            prospect_logo_url: fallbackLogo,
            prospect_brand: { logo: fallbackLogo } as never,
          } as never);
          toast.message("Used a logo guess from the domain (brand fetch failed)");
        } else {
          toast.error("Couldn't pull the prospect's brand — add a logo manually in the report.");
        }
      }

      if (deal.prospect_company == null || deal.prospect_company === "") {
        // Try to derive a name from URL
        const m = query.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i);
        if (m) {
          const guess = m[1].split(".")[0];
          persist({ prospect_company: guess.charAt(0).toUpperCase() + guess.slice(1) });
        }
      }
      toast.success("Intel ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      className={cn("h-full bg-surface flex", inSheet ? "w-full" : "")}
      style={inSheet ? undefined : { width: 420 }}
    >
      {/* Collapse rail — desktop inline mode only */}
      {!inSheet && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand company research" : "Collapse company research"}
          className="group h-full w-11 shrink-0 border-r border-border flex flex-col items-center justify-between py-3 hover:bg-muted/40 transition-colors"
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="size-7 grid place-items-center rounded-md border border-border bg-card text-muted-foreground group-hover:text-foreground group-hover:border-foreground/30 transition-colors"
          >
            <ChevronsLeft className="size-3.5" />
          </motion.div>

          <div className="flex-1 grid place-items-center overflow-hidden">
            <motion.div
              animate={{ opacity: collapsed ? 1 : 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: collapsed ? 0.25 : 0 }}
              className="rotate-180 [writing-mode:vertical-rl] font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground group-hover:text-foreground transition-colors"
            >
              Company Research
            </motion.div>
          </div>

          <motion.div
            animate={{ opacity: collapsed ? 1 : 0, scale: collapsed ? 1 : 0.6 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: collapsed ? 0.2 : 0 }}
            className="size-7 grid place-items-center rounded-md text-muted-foreground"
          >
            <Search className="size-3.5" />
          </motion.div>
        </button>
      )}

      {/* Expanded content — fades + slides as parent width clips it */}
      <motion.div
        animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -12 : 0 }}
        transition={{
          duration: collapsed ? 0.3 : 0.5,
          ease: [0.22, 1, 0.36, 1],
          delay: collapsed ? 0 : 0.15,
        }}
        className="flex-1 min-w-0 flex flex-col"
        style={{ pointerEvents: collapsed ? "none" : "auto" }}
      >
        <div className={cn("p-4 border-b border-border space-y-3 shrink-0", inSheet && "pr-12")}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Company Research
            </span>
            <div className="flex bg-muted rounded p-0.5">
              {(["fast", "deep"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded transition",
                    mode === m
                      ? "bg-card shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="https://acme.com or describe…"
              className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              Pitch for this prospect{" "}
              <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">
                — optional
              </span>
            </label>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="What you're selling them and why it fits — e.g. 'Replace their 3 disconnected internal tools with one customizable platform their ops team can edit themselves.'"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs leading-relaxed focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-white text-[11px] font-bold uppercase tracking-wider rounded-full transition active:scale-[0.98] disabled:opacity-60 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] hover:opacity-90"
            style={{ backgroundImage: "linear-gradient(90deg, var(--brand-from), var(--brand-to))" }}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            {loading ? "Researching" : `Run ${mode === "deep" ? "deep" : "fast"} research`}
          </button>
        </div>

        <div data-lenis-prevent className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
          {!result && !loading && (
            <div className="grid place-items-center h-full text-center px-6">
              <div className="space-y-2">
                <Search className="size-6 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Drop a company URL or notes to surface pain points and tailored angles.
                </p>
              </div>
            </div>
          )}
          {result && (
            <>
              <ResearchBlock label="Snapshot" delay={0}>
                <p className="text-xs leading-relaxed text-foreground/85">{result.snapshot}</p>
              </ResearchBlock>
              <ResearchBlock label="Pain Points" delay={0.05}>
                <ul className="space-y-2">
                  {result.pain_points?.map((p, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <span className="text-primary">•</span>
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </ResearchBlock>
              <ResearchBlock label="Why We Fit" delay={0.1}>
                <ul className="space-y-2">
                  {result.why_we_fit?.map((p, i) => (
                    <li
                      key={i}
                      className="p-3 text-[11px] border border-border rounded-md hover:border-primary/40 transition-colors text-foreground/85"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </ResearchBlock>
              <ResearchBlock label="Talking Points" delay={0.15}>
                <ul className="space-y-2">
                  {result.talking_points?.map((p, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <span className="text-primary">→</span>
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </ResearchBlock>
              {result.recent_news && result.recent_news.length > 0 && (
                <ResearchBlock label="Recent Signals" delay={0.2}>
                  <ul className="space-y-2">
                    {result.recent_news.map((n, i) => (
                      <li key={i} className="text-[11px] italic text-muted-foreground">
                        {n}
                      </li>
                    ))}
                  </ul>
                </ResearchBlock>
              )}
            </>
          )}
        </div>

        {/* Hint about settings */}
        {(!myCompany || !myProduct) && (
          <div className="p-3 bg-muted/40 border-t border-border text-[10px] text-muted-foreground">
            Tip: set your company + product in <span className="font-bold">Settings</span> for
            sharper "Why We Fit" angles.
          </div>
        )}
      </motion.div>
    </aside>
  );
}

function ResearchBlock({
  label,
  children,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-2"
    >
      <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-primary font-bold">
        {label}
      </span>
      {children}
    </motion.section>
  );
}

/* ─────────────── Settings ─────────────── */

type Settings = {
  id?: string;
  company_name: string;
  product_description: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_tagline: string;
};

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>({
    company_name: "",
    product_description: "",
    brand_logo_url: null,
    brand_primary_color: "#0F0F0F",
    brand_tagline: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").limit(1).maybeSingle();
      if (data)
        setSettings({
          id: data.id,
          company_name: data.company_name || "",
          product_description: data.product_description || "",
          brand_logo_url: data.brand_logo_url ?? null,
          brand_primary_color: data.brand_primary_color || "#0F0F0F",
          brand_tagline: data.brand_tagline || "",
        });
    })();
  }, []);

  const uploadLogo = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be ≤ 2MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `brand/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setSettings((s) => ({ ...s, brand_logo_url: data.publicUrl }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      company_name: settings.company_name,
      product_description: settings.product_description,
      brand_logo_url: settings.brand_logo_url,
      brand_primary_color: settings.brand_primary_color,
      brand_tagline: settings.brand_tagline,
    };
    if (settings.id) await supabase.from("user_settings").update(payload).eq("id", settings.id);
    else await supabase.from("user_settings").insert(payload);
    setSaving(false);
    toast.success("Settings saved");
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        className="w-full max-w-lg bg-card rounded-2xl shadow-lift border border-border p-6 space-y-5 max-h-[90vh] overflow-y-auto scrollbar-thin"
      >
        <div className="flex items-center justify-between sticky top-0 bg-card pb-2 -mt-1">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Defaults
            </p>
            <h2 className="text-lg font-bold mt-1">Your sales context</h2>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center hover:bg-muted rounded-md"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Your Company
            </label>
            <input
              value={settings.company_name}
              onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
              placeholder="Acme Inc"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              What You Sell
            </label>
            <textarea
              value={settings.product_description}
              onChange={(e) => setSettings((s) => ({ ...s, product_description: e.target.value }))}
              placeholder="B2B observability platform — typical ACV $50k–$500k. Helps eng teams cut MTTR by 60%."
              rows={4}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
            <p className="text-[10px] text-muted-foreground">
              Used by AI to tailor "Why We Fit" angles per prospect.
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Branding
            </p>
            <h3 className="text-sm font-bold mt-1">Your report identity</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Applied to every PDF report you export.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Logo
            </label>
            <div
              className={`flex items-center gap-3 rounded-md transition ${dragOver ? "ring-2 ring-primary ring-offset-2 ring-offset-card bg-primary/5" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith("image/")) uploadLogo(f);
                else if (f) toast.error("Drop an image file (PNG, JPG, SVG)");
              }}
            >
              <div className="size-16 shrink-0 rounded-md border border-dashed border-border bg-background grid place-items-center overflow-hidden">
                {settings.brand_logo_url ? (
                  <img
                    src={settings.brand_logo_url}
                    alt="brand"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <ImagePlus className="size-5 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-border rounded-md hover:bg-accent transition disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ImagePlus className="size-3" />
                  )}
                  {settings.brand_logo_url ? "Replace logo" : "Upload logo"}
                </button>
                {settings.brand_logo_url && (
                  <button
                    onClick={() => setSettings((s) => ({ ...s, brand_logo_url: null }))}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              PNG, JPG, or SVG. Max 2MB. Drag & drop or click to upload.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Primary brand color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.brand_primary_color}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, brand_primary_color: e.target.value }))
                }
                className="size-10 rounded-md border border-border bg-background cursor-pointer"
              />
              <input
                type="text"
                value={settings.brand_primary_color}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, brand_primary_color: e.target.value }))
                }
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-primary focus:outline-none"
                placeholder="#0F0F0F"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Tagline{" "}
              <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">
                — optional
              </span>
            </label>
            <input
              value={settings.brand_tagline}
              onChange={(e) => setSettings((s) => ({ ...s, brand_tagline: e.target.value }))}
              placeholder="The platform every team can build on."
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <p className="text-[10px] text-muted-foreground">
              Appears on the report cover under your company name.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-card -mx-1 px-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-foreground text-background rounded-md hover:bg-foreground/90 active:scale-95 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-3 animate-spin" />} Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StartHereGuide({ onClose }: { onClose: () => void }) {
  const Step = ({
    n,
    icon: Icon,
    title,
    children,
  }: {
    n: number;
    icon: typeof HelpCircle;
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="flex gap-3">
      <div className="shrink-0 flex flex-col items-center">
        <div
          className="flex items-center justify-center size-7 rounded-full text-[11px] font-mono font-semibold text-background"
          style={{ backgroundColor: "var(--brand-from)" }}
        >
          {n}
        </div>
      </div>
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
        </div>
        <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground space-y-1.5">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <HelpCircle className="size-3" /> Start here
        </div>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-balance">
          Build a branded ROI business case in five minutes
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          A quick tour of the calculator, the AI research panel, and the report export — written
          for this exact app.
        </p>
      </div>

      <div className="px-6 py-5">
        <div className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="text-[12.5px] leading-relaxed text-foreground/90">
            <div className="font-semibold text-foreground">Your workspace is private.</div>
            <p className="mt-1 text-muted-foreground">
              Sign-in is required and every deal, template, and brand setting is scoped to your
              account. Nobody else (not even other signed-in users) can see your data.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 pb-6">
        <Step n={1} icon={LayoutTemplate} title="Pick a template">
          <p>
            Top-left of the nav, click the template name to swap between built-ins (Cloud Migration,
            Automation, etc.). Each template defines the input fields, formulas, and report sections
            you'll work with.
          </p>
        </Step>
        <Step n={2} icon={Search} title="Research the prospect with AI">
          <p>
            Open the <span className="font-medium text-foreground">Research</span> panel (right side
            on desktop, button in the nav on smaller screens). Paste a company URL or name — the AI
            pulls company facts, suggests the best template, and can prefill calculator inputs.
          </p>
        </Step>
        <Step n={3} icon={Palette} title="Pull their branding">
          <p>
            In Research, click <span className="font-medium text-foreground">Pull branding</span> to
            grab the prospect's logo and brand colors from their site. These flow into the report
            theme so the deck feels native to them — not to you.
          </p>
        </Step>
        <Step n={4} icon={Sigma} title="Tune the numbers">
          <p>
            Edit any input on the left. Results recompute live. Use the{" "}
            <span className="font-medium text-foreground">Conservative / Expected / Optimistic</span>{" "}
            tabs to stress-test the case. Formulas live in the template — you can save a customized
            version via <span className="font-mono text-[11.5px]">Save current as template…</span>.
          </p>
        </Step>
        <Step n={5} icon={FileDown} title="Build and share the report">
          <p>
            Click <span className="font-medium text-foreground">Build Report</span> (top right) to
            open the editor. Tweak copy with the AI rewrite tool, then export a branded PDF or copy
            a <span className="font-mono text-[11.5px]">/share/&lt;dealId&gt;</span> link for the
            prospect.
          </p>
        </Step>

        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <Lightbulb className="size-3" /> Good to know
          </div>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-muted-foreground">
            <li className="flex gap-2">
              <ListChecks className="size-3.5 mt-0.5 shrink-0 text-foreground/60" />
              Deals auto-save. Switch between them from the deal picker in the nav.
            </li>
            <li className="flex gap-2">
              <ListChecks className="size-3.5 mt-0.5 shrink-0 text-foreground/60" />
              Your own logo and company name live in <span className="font-medium text-foreground">Settings</span> (gear icon) and appear in every report.
            </li>
            <li className="flex gap-2">
              <ListChecks className="size-3.5 mt-0.5 shrink-0 text-foreground/60" />
              The report theme gradient uses the prospect's brand colors — override the second color via the Custom theme picker in the report editor.
            </li>
          </ul>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <Globe className="size-3" /> Optional connector
            </div>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted">
              Recommended
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">Firecrawl</div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            The app works without it — research falls back to the LLM's general knowledge, and
            brand pull guesses a logo from the domain. With Firecrawl connected, the
            <span className="font-medium text-foreground"> deep research</span> mode scrapes the
            prospect's actual website so prospect intel is grounded in real copy, and{" "}
            <span className="font-medium text-foreground">pull branding</span> can extract their
            real logo, colors, and fonts.
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Free tier covers ~500 credits/month — enough for a few hundred prospect lookups. Paid
            plans start at $16/mo. Enable it under{" "}
            <span className="font-medium text-foreground">Connectors → Firecrawl</span>; the app
            picks it up automatically — no config in here.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-foreground text-background text-sm font-medium py-2.5 hover:bg-foreground/90 transition"
        >
          Got it — let's build
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Report Editor + Branded PDF ─────────────── */

import type { Computed } from "@/lib/calc";

type ReportData = {
  headline: string;
  intro: string;
  exec_summary: string;
  why_we_fit: string[];
  talking_points: string[];
  cta: string;
};

type Brand = {
  company_name: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_tagline: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([a-f0-9]{6}|[a-f0-9]{3})$/i);
  if (!m) return [15, 15, 15];
  const h =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Load an image URL and return a PNG data URL along with its natural pixel
 * dimensions. SVGs are rasterized to PNG at 3x the target box for crispness so
 * jsPDF's addImage can render them. Returns null when the image cannot be
 * fetched, decoded, or rasterized.
 */
async function loadImageForPdf(
  url: string,
  rasterTargetPx = 600,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG"; w: number; h: number } | null> {
  // Always proxy through the server so cross-origin logos (clearbit, prospect
  // CDNs) don't taint the canvas. The browser fetch path would silently fail
  // toDataURL() and the PDF would render without a logo.
  let srcDataUrl: string | null = null;
  let isSvg = false;
  if (url.startsWith("data:")) {
    srcDataUrl = url;
    isSvg = url.startsWith("data:image/svg");
  } else {
    try {
      const proxied = await proxyImageAsDataUrl({ data: { url } });
      srcDataUrl = proxied.dataUrl;
      isSvg =
        proxied.dataUrl.startsWith("data:image/svg") ||
        /\.svg(\?|#|$)/i.test(url);
    } catch {
      srcDataUrl = null;
    }
  }
  if (!srcDataUrl) return null;
  try {
    // Decode to get intrinsic dimensions.
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode"));
      im.src = srcDataUrl;
    });
    const natW = img.naturalWidth || img.width || 1;
    const natH = img.naturalHeight || img.height || 1;
    // Always rasterize through a canvas so jsPDF gets a clean PNG (also
    // handles SVGs, which addImage cannot consume directly).
    const scale = isSvg
      ? Math.max(1, rasterTargetPx / Math.max(natW, natH))
      : 1;
    const cw = Math.max(1, Math.round(natW * scale));
    const ch = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL("image/png");
    return { dataUrl, format: "PNG", w: natW, h: natH };
  } catch {
    return null;
  }
}

/** Fit an image of (w, h) into a max box, preserving aspect ratio. */
function fitBox(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: maxW, h: maxH };
  const s = Math.min(maxW / w, maxH / h);
  return { w: w * s, h: h * s };
}

/* ─────────── AI Rewrite Popover (per-block) ─────────── */

type BlockType =
  | "headline"
  | "intro"
  | "exec_summary"
  | "why_we_fit_item"
  | "talking_point"
  | "cta";

const PRESETS: Record<BlockType, { label: string; instruction: string }[]> = {
  headline: [
    { label: "Punchier", instruction: "Make it punchier and more confident. Max 10 words." },
    { label: "Numbers-first", instruction: "Lead with the headline ROI number." },
    { label: "More specific", instruction: "Make it more specific to the prospect." },
  ],
  intro: [
    { label: "Shorter", instruction: "Cut to 1 tight sentence." },
    { label: "More technical", instruction: "Make the tone more technical and precise." },
    { label: "Warmer", instruction: "Warmer, more human tone — still professional." },
  ],
  exec_summary: [
    { label: "More concise", instruction: "Cut to half the length. Keep all key numbers." },
    { label: "Lead with impact", instruction: "Restructure to lead with business impact, not setup." },
    { label: "CFO-ready", instruction: "Rewrite for a CFO audience — finance language, payback-focused." },
  ],
  why_we_fit_item: [
    { label: "More specific", instruction: "Make it more specific to the prospect's context." },
    { label: "Shorter", instruction: "Cut to one tight sentence." },
    { label: "Add a metric", instruction: "Include a concrete metric or before/after." },
  ],
  talking_point: [
    { label: "As a question", instruction: "Reframe as a sharp discovery question." },
    { label: "Shorter", instruction: "Cut to a single tight sentence." },
    { label: "More specific", instruction: "Tie it to the prospect's industry or scale." },
  ],
  cta: [
    { label: "More urgent", instruction: "Add urgency without being pushy." },
    { label: "Soft ask", instruction: "Make it a softer, lower-friction next step." },
    { label: "Concrete", instruction: "Make the next step very concrete — name a meeting type and length." },
  ],
};

function AIAssist({
  original,
  blockType,
  context,
  onApply,
  className,
}: {
  original: string;
  blockType: BlockType;
  context: {
    prospectCompany?: string;
    myCompany?: string;
    scenario?: string;
    roiPercent?: number;
    annualGain?: number;
    threeYearValue?: number;
    paybackMonths?: number;
  };
  onApply: (text: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const rewrite = useServerFn(rewriteBlock);

  const run = async (instruction: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rewrite({
        data: { original, instruction, blockType, context },
      });
      onApply(r.text);
      setOpen(false);
      setPrompt("");
      toast.success("Rewritten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI rewrite failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="AI rewrite"
          className={cn(
            "size-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            className,
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Rewrite with AI
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS[blockType].map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={() => run(p.instruction)}
              className="px-2 py-1 text-[11px] rounded-md border border-border hover:bg-muted transition disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Or describe a change… e.g. 'mention our retail focus'"
            rows={2}
            className="w-full text-xs bg-background border border-border rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            disabled={busy || !prompt.trim()}
            onClick={() => run(prompt.trim())}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-foreground text-background rounded-md hover:bg-foreground/90 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Rewrite
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────── Share helpers ─────────── */

function buildShareUrl(dealId: string): string {
  if (typeof window === "undefined") return `/share/${dealId}`;
  const host = window.location.hostname;
  const isPreview =
    host.startsWith("id-preview--") ||
    host.endsWith(".lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1";
  const base = isPreview
    ? "https://roi-sales-companion.lovable.app"
    : window.location.origin;
  return `${base}/share/${dealId}`;
}

function ShareView({
  dealId,
  prospectCompany,
  accent,
  accentGradient,
}: {
  dealId: string;
  prospectCompany: string | null;
  accent: string;
  accentGradient: string;
}) {
  const isLocal = dealId.startsWith("local-");
  const url = isLocal ? "" : buildShareUrl(dealId);
  const copy = async () => {
    if (!url) {
      toast.error("Save the deal first to share it.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
        return;
      }
      throw new Error("clipboard unavailable");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "0";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, url.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) {
          toast.success("Link copied");
          return;
        }
      } catch {
        // fall through
      }
      toast.message("Copy this link", { description: url });
    }
  };
  const open = () => {
    if (!url) {
      toast.error("Save the deal first to share it.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(url)}`
    : "";

  return (
    <div className="max-w-2xl mx-auto bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="h-1.5" style={{ background: accentGradient }} />
      <div className="p-6 sm:p-10 space-y-6">
        <div>
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]"
            style={{ color: accent }}
          >
            Prospect calculator link
          </p>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight mt-2">
            Let {prospectCompany || "your prospect"} try the calculator
          </h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Anyone with this link can adjust the inputs and see the projected ROI
            in real time. No sign-in required.
          </p>
        </div>

        {isLocal ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Save the deal once to generate a shareable link.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-transparent text-xs sm:text-sm font-mono truncate focus:outline-none"
              />
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white rounded-md shadow-sm hover:brightness-110 transition active:scale-95"
                style={{ background: accentGradient }}
              >
                <CopyIcon className="size-3" /> Copy
              </button>
            </div>

            <div className="grid sm:grid-cols-[260px_1fr] gap-6 items-start">
              <div className="rounded-xl border border-border bg-background p-3 grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc}
                  alt="QR code for the prospect link"
                  width={240}
                  height={240}
                  className="size-[240px]"
                />
              </div>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Drop the link into an email, calendar invite, or Slack DM —
                  or have your prospect scan the QR on screen.
                </p>
                <p>
                  The calculator opens with the inputs you set here. Their tweaks
                  stay local to their session — your deal isn't affected.
                </p>
                <button
                  onClick={open}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-md border border-border hover:bg-muted transition"
                >
                  <ExternalLink className="size-3.5" /> Open in new tab
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Auto-growing textarea that mimics surrounding text. Used inside the
 * editable PDF canvas so what you type IS what you export.
 */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  style,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      style={style}
      className={cn(
        "w-full bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 -mx-1 block",
        className,
      )}
    />
  );
}

type ReportEdit = {
  update: (patch: Partial<ReportData>) => void;
  updateList: (key: "why_we_fit" | "talking_points", i: number, v: string) => void;
  addItem: (key: "why_we_fit" | "talking_points") => void;
  removeItem: (key: "why_we_fit" | "talking_points", i: number) => void;
};

/**
 * Renders the branded report as a stack of A4-proportioned pages.
 * When `edit` is provided, each text block becomes inline-editable
 * (textareas overlaid on the exact same layout the PDF exports).
 */
function PdfPreview({
  data,
  brand,
  deal,
  computed,
  scenario,
  template,
  accent,
  accentGradient,
  edit,
}: {
  data: ReportData;
  brand: Brand;
  deal: Deal;
  computed: Computed;
  scenario: ScenarioKey;
  template: Template;
  accent: string;
  accentGradient: string;
  edit?: ReportEdit;
}) {
  const editable = !!edit;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const aiCtxFull = {
    prospectCompany: deal.prospect_company ?? undefined,
    myCompany: brand.company_name,
    scenario,
    roiPercent: computed.roiPercent,
    annualGain: computed.annualGain,
    threeYearValue: computed.threeYearValue,
    paybackMonths: computed.paybackMonths,
  };
  const aiCtxShort = {
    prospectCompany: deal.prospect_company ?? undefined,
    myCompany: brand.company_name,
  };

  // Read-only mode locks pages to A4 aspect. Editable mode lets pages grow
  // with content (with a min-height that matches A4 at the current width)
  // and surfaces an overflow chip so the user knows their content will
  // paginate to a second printed page on export.
  const pageClass = cn(
    "relative bg-white text-neutral-900 shadow-lift rounded-md mx-auto w-full max-w-[640px]",
    editable ? "overflow-visible" : "aspect-[1/1.414] overflow-hidden",
  );
  const innerStyle: React.CSSProperties = editable
    ? { minHeight: "min(905px, calc((100vw - 32px) * 1.414))" }
    : { height: "100%" };

  const footer = (n: number, total: number) => (
    <div className="absolute bottom-0 inset-x-0 px-8 py-3 flex items-center justify-between text-[9px] text-neutral-400">
      <span className="truncate">
        {brand.company_name
          ? `${brand.company_name} · Business case for ${deal.prospect_company || "prospect"}`
          : "Business case"}
      </span>
      <span>
        {n} / {total}
      </span>
    </div>
  );

  const sideRail = (
    <></>
  );

  const fits = data.why_we_fit;
  const tps = data.talking_points;
  const fitsNonEmpty = fits.filter((s) => s.trim());
  const tpsNonEmpty = tps.filter((s) => s.trim());
  // In editable mode, always show the fits/cta pages so authors can fill them.
  const includeFitsPage = editable || fitsNonEmpty.length > 0;
  const includeCtaPage = editable || tpsNonEmpty.length > 0 || data.cta.trim().length > 0;
  const total = 3 + (includeFitsPage ? 1 : 0) + (includeCtaPage ? 1 : 0);
  let pageNum = 0;
  const next = () => ++pageNum;

  const brandHeading = (deal.prospect_brand?.headingFont || "").trim();
  const brandBody = (deal.prospect_brand?.bodyFont || "").trim();
  const canvasStyle: React.CSSProperties = {
    ...(brandHeading
      ? ({ ["--report-heading-font" as string]: `"${brandHeading}", ui-sans-serif, system-ui` } as React.CSSProperties)
      : {}),
    ...(brandBody
      ? ({ ["--report-body-font" as string]: `"${brandBody}", ui-sans-serif, system-ui` } as React.CSSProperties)
      : {}),
    ...(brandBody ? { fontFamily: "var(--report-body-font)" } : {}),
  };

  return (
    <div className="space-y-6 pb-6" style={canvasStyle}>
      <div className="max-w-[640px] mx-auto flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono uppercase tracking-wider">
          {editable ? "Edit in place · what you see is what exports" : "Pages match the exported PDF"}
        </span>
        {editable && (
          <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider">
            <Sparkles className="size-3" /> Hover any block for AI
          </span>
        )}
      </div>

      {/* Page 1 — Cover */}
      {(() => {
        const n = next();
        return (
          <PageShell editable={editable} className={pageClass}>
            {/* Faint corner wash in prospect color for warmth without overwhelming */}
            <div
              className="absolute inset-x-0 top-0 h-[55%] pointer-events-none"
              style={{
                background: `radial-gradient(120% 80% at 85% 0%, ${accent}14 0%, transparent 60%)`,
              }}
            />
            <div className="relative flex flex-col p-8 sm:p-10" style={innerStyle}>
              {/* Report header: "Prepared for X · By Y" with both logos */}
              <div className="pt-2">
                <p
                  className="text-[10px] font-bold tracking-[0.3em] uppercase"
                  style={{ color: accent }}
                >
                  projected roi report
                </p>
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-5">
                  {/* Prepared for — prospect */}
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold tracking-[0.25em] uppercase text-neutral-400">
                      Prepared for
                    </p>
                    <div className="mt-2 flex items-center gap-3 min-h-[2.5rem]">
                      {deal.prospect_logo_url && (
                        <img
                          src={deal.prospect_logo_url}
                          alt=""
                          className="max-h-9 max-w-[8rem] object-contain"
                        />
                      )}
                      <span
                        className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 truncate"
                        style={brandHeading ? { fontFamily: "var(--report-heading-font)" } : undefined}
                      >
                        {deal.prospect_company || "Prospect"}
                      </span>
                    </div>
                  </div>
                  {/* Divider */}
                  <div
                    className="h-10 w-px"
                    style={{ background: `${accent}33` }}
                  />
                  {/* Presented by — our company */}
                  <div className="min-w-0 text-right">
                    <p className="text-[9px] font-bold tracking-[0.25em] uppercase text-neutral-400">
                      Presented by
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-3 min-h-[2.5rem]">
                      <span
                        className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 truncate"
                        style={brandHeading ? { fontFamily: "var(--report-heading-font)" } : undefined}
                      >
                        {brand.company_name || "Your Company"}
                      </span>
                      {brand.brand_logo_url && (
                        <img
                          src={brand.brand_logo_url}
                          alt=""
                          className="max-h-9 max-w-[8rem] object-contain"
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className="mt-6 h-px w-full"
                  style={{ background: `${accent}1f` }}
                />
              </div>
              <div className="mt-auto pb-2">
                <p
                  className="text-[10px] font-bold tracking-[0.25em] uppercase"
                  style={{ color: accent }}
                >
                  Business Case
                </p>
                {editable ? (
                  <div className="group relative mt-2">
                    <AutoTextarea
                      value={data.headline}
                      onChange={(e) => edit!.update({ headline: e.target.value })}
                      ariaLabel="Headline"
                      placeholder="Headline"
                      className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight"
                      style={brandHeading ? { fontFamily: "var(--report-heading-font)" } : undefined}
                    />
                    <AIAssist
                      blockType="headline"
                      original={data.headline}
                      onApply={(t) => edit!.update({ headline: t })}
                      context={aiCtxFull}
                      className="absolute top-1 right-1"
                    />
                  </div>
                ) : (
                  <h1
                    className="text-2xl sm:text-3xl font-bold tracking-tight mt-2 leading-tight"
                    style={brandHeading ? { fontFamily: "var(--report-heading-font)" } : undefined}
                  >
                    {data.headline}
                  </h1>
                )}
                {editable ? (
                  <div className="group relative mt-3">
                    <AutoTextarea
                      value={data.intro}
                      onChange={(e) => edit!.update({ intro: e.target.value })}
                      ariaLabel="Intro"
                      placeholder="Short intro shown under the headline"
                      className="text-xs sm:text-sm text-neutral-600 leading-relaxed"
                    />
                    <AIAssist
                      blockType="intro"
                      original={data.intro}
                      onApply={(t) => edit!.update({ intro: t })}
                      context={aiCtxFull}
                      className="absolute top-1 right-1"
                    />
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-neutral-600 mt-3 leading-relaxed">
                    {data.intro}
                  </p>
                )}
                <div
                  className="mt-6 rounded-lg p-4 text-white flex items-center justify-between"
                  style={{ background: accentGradient }}
                >
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.25em] uppercase opacity-80">
                      Projected ROI · {scenario}
                    </p>
                    <p className="text-3xl font-bold tracking-tight mt-1">
                      {isFinite(computed.roiPercent)
                        ? `${formatNumber(computed.roiPercent)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right text-[10px] opacity-90">
                    {formatCurrency(computed.threeYearValue)}
                    <br />
                    3-year value
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[9px] text-neutral-500">
                  <span>{brand.brand_tagline || ""}</span>
                  <span>Prepared {today}</span>
                </div>
              </div>
            </div>
            {footer(n, total)}
          </PageShell>
        );
      })()}

      {/* Page 2 — Numbers + Exec Summary */}
      {(() => {
        const n = next();
        return (
          <PageShell editable={editable} className={pageClass}>
            {sideRail}
            <div className="relative flex flex-col p-8 sm:p-10 pt-10" style={innerStyle}>
              <SectionLabel accent={accent}>The Numbers</SectionLabel>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[
                  ["Annual Investment", formatCurrency(computed.annualCost)],
                  ["Annual Gain", formatCurrency(computed.annualGain)],
                  ["3-Year Value", formatCurrency(computed.threeYearValue)],
                  [
                    "Payback",
                    isFinite(computed.paybackMonths)
                      ? `${computed.paybackMonths.toFixed(1)} mo`
                      : "—",
                  ],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="relative rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 pl-4 overflow-hidden"
                  >
                    <div
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: accent }}
                    />
                    <p className="text-[8px] font-bold tracking-wider uppercase text-neutral-500">
                      {l}
                    </p>
                    <p className="text-base font-bold mt-1">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <SectionLabel accent={accent}>Executive Summary</SectionLabel>
                {editable ? (
                  <div className="group relative mt-3">
                    <AutoTextarea
                      value={data.exec_summary}
                      onChange={(e) => edit!.update({ exec_summary: e.target.value })}
                      ariaLabel="Executive summary"
                      placeholder="A 2–4 sentence summary the exec will read first"
                      className="text-[11px] leading-relaxed text-neutral-700"
                    />
                    <AIAssist
                      blockType="exec_summary"
                      original={data.exec_summary}
                      onApply={(t) => edit!.update({ exec_summary: t })}
                      context={aiCtxFull}
                      className="absolute top-1 right-1"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-neutral-700 mt-3 whitespace-pre-wrap">
                    {data.exec_summary}
                  </p>
                )}
              </div>
            </div>
            {footer(n, total)}
          </PageShell>
        );
      })()}

      {/* Page 3 — Parameters & Returns (driven by deal, read-only here) */}
      {(() => {
        const n = next();
        return (
          <PageShell editable={editable} className={pageClass}>
            {sideRail}
            <div
              className="relative flex flex-col p-8 sm:p-10 pt-10 gap-6"
              style={innerStyle}
            >
              <FieldsBlock
                title="Investment parameters"
                fields={template.parameters}
                values={deal.values || {}}
                accent={accent}
              />
              <FieldsBlock
                title="Projected returns"
                fields={template.returns}
                values={deal.values || {}}
                accent={accent}
              />
              {editable && (
                <p className="text-[10px] text-neutral-400 italic mt-auto pt-4">
                  Numbers come from the calculator — edit them in the deal sliders.
                </p>
              )}
            </div>
            {footer(n, total)}
          </PageShell>
        );
      })()}

      {/* Page 4 — Why we fit */}
      {includeFitsPage &&
        (() => {
          const n = next();
          return (
            <PageShell editable={editable} className={pageClass}>
              {sideRail}
              <div
                className="relative flex flex-col p-8 sm:p-10 pt-10"
                style={innerStyle}
              >
                <div className="flex items-center justify-between">
                  <SectionLabel accent={accent}>Why This Fits</SectionLabel>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => edit!.addItem("why_we_fit")}
                      className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Add point
                    </button>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {(editable ? fits : fitsNonEmpty).map((p, i) => (
                    <div
                      key={i}
                      className="group rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 flex gap-3 items-start relative"
                    >
                      <div
                        className="size-6 shrink-0 rounded-full grid place-items-center text-[10px] font-bold text-white"
                        style={{ background: accentGradient }}
                      >
                        {i + 1}
                      </div>
                      {editable ? (
                        <>
                          <AutoTextarea
                            value={p}
                            onChange={(e) =>
                              edit!.updateList("why_we_fit", i, e.target.value)
                            }
                            ariaLabel={`Why we fit point ${i + 1}`}
                            placeholder="A reason this is the right fit…"
                            className="flex-1 text-[11px] leading-relaxed text-neutral-700"
                          />
                          <div className="flex items-center gap-0.5 shrink-0">
                            <AIAssist
                              blockType="why_we_fit_item"
                              original={p}
                              onApply={(t) =>
                                edit!.updateList("why_we_fit", i, t)
                              }
                              context={aiCtxShort}
                            />
                            <button
                              type="button"
                              onClick={() => edit!.removeItem("why_we_fit", i)}
                              aria-label="Remove point"
                              className="size-6 grid place-items-center rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] leading-relaxed text-neutral-700">{p}</p>
                      )}
                    </div>
                  ))}
                  {editable && fits.length === 0 && (
                    <button
                      type="button"
                      onClick={() => edit!.addItem("why_we_fit")}
                      className="w-full rounded-lg border border-dashed border-neutral-300 p-4 text-[11px] text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition flex items-center justify-center gap-1.5"
                    >
                      <Plus className="size-3.5" /> Add the first reason
                    </button>
                  )}
                </div>
              </div>
              {footer(n, total)}
            </PageShell>
          );
        })()}

      {/* Page 5 — Discussion + CTA */}
      {includeCtaPage &&
        (() => {
          const n = next();
          return (
            <PageShell editable={editable} className={pageClass}>
              {sideRail}
              <div
                className="relative flex flex-col p-8 sm:p-10 pt-10"
                style={innerStyle}
              >
                <div className="flex items-center justify-between">
                  <SectionLabel accent={accent}>Key Discussion Points</SectionLabel>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => edit!.addItem("talking_points")}
                      className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Add point
                    </button>
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {(editable ? tps : tpsNonEmpty).map((p, i) => (
                    <li
                      key={i}
                      className="group flex gap-2 items-start text-[11px] leading-relaxed text-neutral-700"
                    >
                      <span
                        className="mt-1.5 size-1.5 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      {editable ? (
                        <>
                          <AutoTextarea
                            value={p}
                            onChange={(e) =>
                              edit!.updateList("talking_points", i, e.target.value)
                            }
                            ariaLabel={`Talking point ${i + 1}`}
                            placeholder="A point to raise in the next meeting…"
                            className="flex-1"
                          />
                          <div className="flex items-center gap-0.5 shrink-0">
                            <AIAssist
                              blockType="talking_point"
                              original={p}
                              onApply={(t) =>
                                edit!.updateList("talking_points", i, t)
                              }
                              context={aiCtxShort}
                            />
                            <button
                              type="button"
                              onClick={() => edit!.removeItem("talking_points", i)}
                              aria-label="Remove point"
                              className="size-6 grid place-items-center rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <span>{p}</span>
                      )}
                    </li>
                  ))}
                  {editable && tps.length === 0 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => edit!.addItem("talking_points")}
                        className="w-full rounded-lg border border-dashed border-neutral-300 p-3 text-[11px] text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition flex items-center justify-center gap-1.5"
                      >
                        <Plus className="size-3.5" /> Add the first point
                      </button>
                    </li>
                  )}
                </ul>
                {(editable || data.cta.trim()) && (
                  <div
                    className="mt-auto rounded-lg p-4 text-white relative group"
                    style={{ background: accentGradient }}
                  >
                    <p className="text-[9px] font-bold tracking-[0.25em] uppercase opacity-80">
                      Next Step
                    </p>
                    {editable ? (
                      <>
                        <AutoTextarea
                          value={data.cta}
                          onChange={(e) => edit!.update({ cta: e.target.value })}
                          ariaLabel="Call to action"
                          placeholder="Propose the next concrete step…"
                          className="text-sm font-bold mt-2 leading-snug text-white placeholder:text-white/60"
                        />
                        <AIAssist
                          blockType="cta"
                          original={data.cta}
                          onApply={(t) => edit!.update({ cta: t })}
                          context={aiCtxShort}
                          className="absolute top-2 right-2 text-white/80 hover:text-white hover:bg-white/10"
                        />
                      </>
                    ) : (
                      <p className="text-sm font-bold mt-2 leading-snug">{data.cta}</p>
                    )}
                  </div>
                )}
              </div>
              {footer(n, total)}
            </PageShell>
          );
        })()}
    </div>
  );
}

/**
 * Page wrapper. In editable mode it watches its own height vs the A4
 * proportion at the current width and surfaces an overflow chip so users
 * know their content will spill onto the next printed page on export.
 */
function PageShell({
  editable,
  className,
  children,
}: {
  editable: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}

function SectionLabel({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div>
      <p
        className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold"
        style={{ color: accent }}
      >
        {children}
      </p>
      <div className="mt-1 h-[1.5px] w-10" style={{ background: accent }} />
    </div>
  );
}

function FieldsBlock({
  title,
  fields,
  values,
  accent,
}: {
  title: string;
  fields: Field[];
  values: Record<string, number>;
  accent: string;
}) {
  return (
    <div>
      <SectionLabel accent={accent}>{title}</SectionLabel>
      <div className="mt-3 divide-y divide-neutral-200">
        {fields.map((f) => {
          const v = values[f.key] ?? f.default;
          const formatted =
            f.unit === "USD" ? formatCurrency(v) : f.unit === "%" ? `${v}%` : formatNumber(v);
          return (
            <div key={f.key} className="flex items-center justify-between py-1.5 text-[11px]">
              <span className="text-neutral-600">{f.label}</span>
              <span className="font-bold text-neutral-900">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportEditor({
  deal,
  template,
  computed,
  scenario,
  persist,
  onClose,
}: {
  deal: Deal;
  template: Template;
  computed: Computed;
  scenario: ScenarioKey;
  persist: (patch: Partial<Deal>) => void;
  onClose: () => void;
}) {
  const [brand, setBrand] = useState<Brand>({
    company_name: "",
    brand_logo_url: null,
    brand_primary_color: "#0F0F0F",
    brand_tagline: "",
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<"edit" | "share">("edit");
  // Autosave state — replaces the manual "Save draft" button.
  // "saved" is the steady state; "saving" shows while a debounced write is in flight;
  // "dirty" appears the moment the user edits, before the debounce timer fires.
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const seededRef = useRef(false);
  const lastSavedJsonRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Report-template library state
  const [showTemplates, setShowTemplates] = useState(false);
  const { data: reportTemplates = [], refetch: refetchReportTemplates } = useQuery({
    queryKey: ["report_templates"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("report_templates")
        .select("id,name,content,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as { id: string; name: string; content: ReportData; updated_at: string }[];
    },
  });

  // Seed report from deal.report or fall back to deal/research/template
  useEffect(() => {
    (async () => {
      const [{ data: settings }, { data: research }] = await Promise.all([
        supabase.from("user_settings").select("*").limit(1).maybeSingle(),
        supabase
          .from("research")
          .select("*")
          .eq("deal_id", deal.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (settings) {
        setBrand({
          company_name: settings.company_name || "",
          brand_logo_url: settings.brand_logo_url ?? null,
          brand_primary_color: settings.brand_primary_color || "#0F0F0F",
          brand_tagline: settings.brand_tagline || "",
        });
      }
      const stored = (deal.report as ReportData | null) || null;
      const r = (research?.result as ResearchResult | undefined) || undefined;
      const prospect = deal.prospect_company || "your team";
      const seed: ReportData = stored || {
        headline: `Projected ROI for ${prospect}`,
        intro: r?.snapshot
          ? `${r.snapshot} This business case quantifies the return ${settings?.company_name || "we"} can deliver against that backdrop.`
          : `A tailored business case quantifying the projected return for ${prospect}.`,
        exec_summary:
          deal.ai_summary ||
          "Click 'Generate' on the calculator's executive summary to draft this section, then refine it here.",
        why_we_fit: r?.why_we_fit?.length
          ? r.why_we_fit
          : ["Run a Fast or Deep research from the sidebar to populate Why We Fit."],
        talking_points: (deal.ai_talking_points as string[] | null)?.length
          ? (deal.ai_talking_points as string[])
          : r?.talking_points || [],
        cta: `Ready to move forward? Let's book a 30-minute scoping session and turn this projection into a deployment plan.`,
      };
      setData(seed);
      seededRef.current = true;
      lastSavedJsonRef.current = JSON.stringify(seed);
      setSaveState("saved");
    })();
  }, [deal.id, deal.ai_summary, deal.ai_talking_points, deal.prospect_company, deal.report]);

  const update = (patch: Partial<ReportData>) => setData((d) => (d ? { ...d, ...patch } : d));
  const updateList = (key: "why_we_fit" | "talking_points", i: number, v: string) =>
    setData((d) => {
      if (!d) return d;
      const next = [...d[key]];
      next[i] = v;
      return { ...d, [key]: next };
    });
  const addItem = (key: "why_we_fit" | "talking_points") =>
    setData((d) => (d ? { ...d, [key]: [...d[key], ""] } : d));
  const removeItem = (key: "why_we_fit" | "talking_points", i: number) =>
    setData((d) => (d ? { ...d, [key]: d[key].filter((_, idx) => idx !== i) } : d));

  // Debounced autosave: 800ms after the last edit, write to the deal.
  // Skips the initial seed and no-op writes (so opening the editor doesn't trigger a save).
  useEffect(() => {
    if (!data || !seededRef.current) return;
    const json = JSON.stringify(data);
    if (json === lastSavedJsonRef.current) return;
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState("saving");
      persist({ report: data as never });
      lastSavedJsonRef.current = json;
      // persist() is fire-and-forget here; flip back to "saved" after a tick.
      setTimeout(() => setSaveState("saved"), 250);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data, persist]);

  // Save the currently-edited report as a reusable template
  const saveAsTemplate = async () => {
    if (!data) return;
    const name = window.prompt("Name this report template", "My report template");
    if (!name) return;
    const { error } = await supabase
      .from("report_templates")
      .insert({ name: name.trim(), content: data as never });
    if (error) {
      toast.error("Could not save template");
      return;
    }
    toast.success("Report template saved");
    refetchReportTemplates();
    setShowTemplates(false);
  };

  // Apply a saved template to the current report (overwrites blocks, autosave picks it up)
  const applyTemplate = (tpl: { name: string; content: ReportData }) => {
    setData(tpl.content);
    setShowTemplates(false);
    toast.success(`Applied “${tpl.name}”`);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("report_templates").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete template");
      return;
    }
    refetchReportTemplates();
  };

  const exportPDF = async () => {
    if (!data) return;
    setExporting(true);
    toast.loading("Building branded PDF…", { id: "pdf" });
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const M = 56;
      const [br, bg, bb] = hexToRgb(accent);
      const [r2, g2, b2] = hexToRgb(accent2);
      const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

      // Reusable: a thin gradient strip rendered as N stacked rects
      const gradientStrip = (x: number, y: number, w: number, h: number, steps = 60) => {
        const sw = w / steps;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          pdf.setFillColor(mix(br, r2, t), mix(bg, g2, t), mix(bb, b2, t));
          pdf.rect(x + i * sw, y, sw + 0.6, h, "F");
        }
      };

      // Page chrome: thin gradient header + subtle side rule, used on every page
      // (Intentionally empty — the blue top bar / left rail were removed
      // because they didn't add anything to the design.)
      const drawChrome = () => {};

      // ── COVER PAGE ──
      // No top bar / left rail — clean white page.

      // Load both logos preserving aspect ratio.
      const LOGO_MAX_H = 36;
      const LOGO_MAX_W = 130;
      const [ourLogo, theirLogo] = await Promise.all([
        brand.brand_logo_url ? loadImageForPdf(brand.brand_logo_url) : Promise.resolve(null),
        deal.prospect_logo_url ? loadImageForPdf(deal.prospect_logo_url) : Promise.resolve(null),
      ]);

      // Header eyebrow ("PROJECTED ROI REPORT") in accent color.
      const headerTop = 64;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(br, bg, bb);
      pdf.text("PROJECTED ROI REPORT", M, headerTop, { charSpace: 1.6 });

      // Header row: "Prepared for" + prospect | divider | "Presented by" + us.
      const rowY = headerTop + 22;
      const rowH = 44;
      const colW = (W - M * 2 - 24) / 2; // 24pt divider gutter
      const leftX = M;
      const rightX = M + colW + 24;

      // Captions.
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(160);
      pdf.text("PREPARED FOR", leftX, rowY, { charSpace: 1.3 });
      pdf.text("PRESENTED BY", rightX + colW, rowY, {
        align: "right",
        charSpace: 1.3,
      });

      // Center label baseline within the row.
      const labelY = rowY + 30;

      // Left side — prospect logo + name (logo first, then name).
      let cursorX = leftX;
      if (theirLogo) {
        const fit = fitBox(theirLogo.w, theirLogo.h, LOGO_MAX_W, LOGO_MAX_H);
        try {
          pdf.addImage(
            theirLogo.dataUrl,
            "PNG",
            cursorX,
            rowY + 8,
            fit.w,
            fit.h,
            undefined,
            "FAST",
          );
          cursorX += fit.w + 12;
        } catch {
          /* ignore */
        }
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(20);
      pdf.text(deal.prospect_company || "Prospect", cursorX, labelY);

      // Right side — our name + logo (text aligned right, logo to its right).
      let rightCursorX = rightX + colW;
      if (ourLogo) {
        const fit = fitBox(ourLogo.w, ourLogo.h, LOGO_MAX_W, LOGO_MAX_H);
        try {
          pdf.addImage(
            ourLogo.dataUrl,
            "PNG",
            rightCursorX - fit.w,
            rowY + 8,
            fit.w,
            fit.h,
            undefined,
            "FAST",
          );
          rightCursorX -= fit.w + 12;
        } catch {
          /* ignore */
        }
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(20);
      pdf.text(brand.company_name || "Your Company", rightCursorX, labelY, {
        align: "right",
      });

      // Vertical accent divider between the two columns.
      const divX = leftX + colW + 12;
      pdf.setDrawColor(br, bg, bb);
      pdf.setLineWidth(0.6);
      pdf.line(divX, rowY + 4, divX, rowY + rowH);
      pdf.setLineWidth(0.5);

      // Hairline below the header.
      const headerEndY = rowY + rowH + 16;
      // faint divider — lightened accent color simulates low opacity
      pdf.setDrawColor(
        Math.round(br + (255 - br) * 0.82),
        Math.round(bg + (255 - bg) * 0.82),
        Math.round(bb + (255 - bb) * 0.82),
      );
      pdf.setLineWidth(0.5);
      pdf.line(M, headerEndY, W - M, headerEndY);

      // Title block — "Business Case" eyebrow + headline + intro, mid page.
      const titleY = headerEndY + 80;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(br, bg, bb);
      pdf.text("BUSINESS CASE", M, titleY, { charSpace: 1.6 });

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(30);
      pdf.setTextColor(20);
      const headLines = pdf.splitTextToSize(data.headline, W - M * 2);
      pdf.text(headLines, M, titleY + 32, { lineHeightFactor: 1.15 });

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(90);
      const introLines = pdf.splitTextToSize(data.intro, W - M * 2 - 40);
      pdf.text(introLines, M, titleY + 32 + headLines.length * 34 + 18, {
        lineHeightFactor: 1.45,
      });

      // ROI badge — full width gradient card
      const roi = isFinite(computed.roiPercent) ? `${formatNumber(computed.roiPercent)}%` : "—";
      const badgeY = H - 240;
      const badgeH = 150;
      gradientStrip(M, badgeY, W - M * 2, badgeH, 80);
      // rounded corners overlay (jsPDF rect doesn't round — fake with side white triangles? skip, keep sharp)
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.text(`PROJECTED ROI  ·  ${scenario.toUpperCase()} SCENARIO`, M + 24, badgeY + 36);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(64);
      pdf.text(roi, M + 24, badgeY + 110);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(255, 255, 255);
      const subText = `${formatCurrency(computed.threeYearValue)} projected 3-year value`;
      pdf.text(subText, W - M - 24, badgeY + 110, { align: "right" });

      // tagline + meta footer
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(120);
      if (brand.brand_tagline) pdf.text(brand.brand_tagline, M, H - 50);
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      pdf.text(`Prepared ${today}`, W - M, H - 50, { align: "right" });

      // ── PAGE 2 — METRICS + EXEC SUMMARY ──
      pdf.addPage();
      let y = 72;
      drawChrome();

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(br, bg, bb);
      pdf.text("THE NUMBERS", M, y);
      y += 8;
      pdf.setDrawColor(br, bg, bb);
      pdf.setLineWidth(1.5);
      pdf.line(M, y, M + 40, y);
      pdf.setLineWidth(0.5);
      y += 24;

      const cards: Array<[string, string]> = [
        ["ANNUAL INVESTMENT", formatCurrency(computed.annualCost)],
        ["ANNUAL GAIN", formatCurrency(computed.annualGain)],
        ["3-YEAR VALUE", formatCurrency(computed.threeYearValue)],
        [
          "PAYBACK",
          isFinite(computed.paybackMonths) ? `${computed.paybackMonths.toFixed(1)} mo` : "—",
        ],
      ];
      // 2x2 grid of bigger cards
      const cw = (W - M * 2 - 16) / 2;
      const chH = 78;
      cards.forEach((c, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = M + col * (cw + 16);
        const yy = y + row * (chH + 14);
        pdf.setDrawColor(230);
        pdf.setFillColor(252, 252, 250);
        pdf.roundedRect(x, yy, cw, chH, 10, 10, "FD");
        // accent left rail
        pdf.setFillColor(br, bg, bb);
        pdf.roundedRect(x, yy, 4, chH, 2, 2, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(c[0], x + 18, yy + 26);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(22);
        pdf.setTextColor(20);
        pdf.text(c[1], x + 18, yy + 60);
      });
      y += chH * 2 + 14 + 36;

      // Executive summary
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(br, bg, bb);
      pdf.text("EXECUTIVE SUMMARY", M, y);
      y += 8;
      pdf.setDrawColor(br, bg, bb);
      pdf.setLineWidth(1.5);
      pdf.line(M, y, M + 40, y);
      pdf.setLineWidth(0.5);
      y += 22;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(50);
      const sumLines = pdf.splitTextToSize(data.exec_summary, W - M * 2);
      pdf.text(sumLines, M, y, { lineHeightFactor: 1.5 });
      y += sumLines.length * 16 + 28;

      // Investment parameters
      const renderSection = (title: string, fields: Field[]) => {
        if (y > H - 160) {
          pdf.addPage();
          y = 72;
          drawChrome();
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(br, bg, bb);
        pdf.text(title.toUpperCase(), M, y);
        y += 8;
        pdf.setDrawColor(br, bg, bb);
        pdf.setLineWidth(1.5);
        pdf.line(M, y, M + 40, y);
        pdf.setLineWidth(0.5);
        y += 22;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(60);
        fields.forEach((f) => {
          if (y > H - 90) {
            pdf.addPage();
            y = 72;
            drawChrome();
          }
          const v = (deal.values || {})[f.key] ?? f.default;
          const formatted =
            f.unit === "USD" ? formatCurrency(v) : f.unit === "%" ? `${v}%` : formatNumber(v);
          pdf.setTextColor(70);
          pdf.text(f.label, M, y);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(20);
          pdf.text(formatted, W - M, y, { align: "right" });
          pdf.setFont("helvetica", "normal");
          pdf.setDrawColor(235);
          pdf.line(M, y + 8, W - M, y + 8);
          y += 22;
        });
        y += 22;
      };
      // Always start parameters on a fresh page for legibility
      pdf.addPage();
      y = 72;
      drawChrome();
      renderSection("Investment parameters", template.parameters);
      renderSection("Projected returns", template.returns);

      // ── WHY WE FIT ──
      if (data.why_we_fit.filter((s) => s.trim()).length) {
        pdf.addPage();
        y = 72;
        drawChrome();
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(br, bg, bb);
        pdf.text("WHY THIS FITS", M, y);
        y += 8;
        pdf.setDrawColor(br, bg, bb);
        pdf.setLineWidth(1.5);
        pdf.line(M, y, M + 40, y);
        pdf.setLineWidth(0.5);
        y += 28;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        data.why_we_fit
          .filter((s) => s.trim())
          .forEach((p, idx) => {
            const lines = pdf.splitTextToSize(p, W - M * 2 - 56);
            const cardH = Math.max(60, lines.length * 16 + 32);
            if (y + cardH > H - 90) {
              pdf.addPage();
              y = 72;
              drawChrome();
            }
            pdf.setDrawColor(230);
            pdf.setFillColor(252, 252, 250);
            pdf.roundedRect(M, y, W - M * 2, cardH, 10, 10, "FD");
            pdf.setFillColor(br, bg, bb);
            pdf.circle(M + 24, y + 26, 12, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(12);
            pdf.setTextColor(255, 255, 255);
            pdf.text(String(idx + 1), M + 24, y + 30, { align: "center" });
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(11);
            pdf.setTextColor(40);
            pdf.text(lines, M + 48, y + 24, { lineHeightFactor: 1.5 });
            y += cardH + 14;
          });
        y += 12;
      }

      // ── TALKING POINTS / NEXT STEPS ──
      if (data.talking_points.filter((s) => s.trim()).length || data.cta.trim()) {
        // Always start a fresh page for discussion + CTA
        pdf.addPage();
        y = 72;
        drawChrome();
        if (data.talking_points.filter((s) => s.trim()).length) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(br, bg, bb);
          pdf.text("KEY DISCUSSION POINTS", M, y);
          y += 8;
          pdf.setDrawColor(br, bg, bb);
          pdf.setLineWidth(1.5);
          pdf.line(M, y, M + 40, y);
          pdf.setLineWidth(0.5);
          y += 24;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);
          pdf.setTextColor(50);
          data.talking_points
            .filter((s) => s.trim())
            .forEach((p) => {
              const lines = pdf.splitTextToSize(p, W - M * 2 - 24);
              if (y + lines.length * 16 > H - 200) {
                pdf.addPage();
                y = 72;
                drawChrome();
              }
              // accent dot
              pdf.setFillColor(br, bg, bb);
              pdf.circle(M + 4, y - 3, 2.5, "F");
              pdf.setTextColor(50);
              pdf.text(lines, M + 16, y, { lineHeightFactor: 1.5 });
              y += lines.length * 16 + 10;
            });
          y += 20;
        }

        if (data.cta.trim()) {
          if (y > H - 160) {
            pdf.addPage();
            y = 72;
            drawChrome();
          }
          const ctaLines = pdf.splitTextToSize(data.cta, W - M * 2 - 48);
          const ctaH = Math.max(110, ctaLines.length * 17 + 60);
          gradientStrip(M, y, W - M * 2, ctaH, 80);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(255, 255, 255);
          pdf.text("NEXT STEP", M + 24, y + 32);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(14);
          pdf.text(ctaLines, M + 24, y + 60, { lineHeightFactor: 1.5 });
          y += ctaH + 12;
        }
      }

      // Footer on every page
      const pages = pdf.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        const left = brand.company_name
          ? `${brand.company_name} · Business case for ${deal.prospect_company || "prospect"}`
          : `Business case`;
        pdf.text(left, M, H - 26);
        pdf.text(`${i} / ${pages}`, W - M, H - 26, { align: "right" });
      }

      pdf.save(
        `${(deal.prospect_company || "ROI").replace(/[^a-z0-9]+/gi, "-")}-business-case.pdf`,
      );
      toast.success("Branded PDF exported", { id: "pdf" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed", { id: "pdf" });
    } finally {
      setExporting(false);
    }
  };

  if (!data) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center"
      >
        <Loader2 className="size-5 animate-spin text-background" />
      </motion.div>
    );
  }

  // Resolve brand colors: prefer the deal's selected color theme so the
  // report visibly matches the rest of the app. Only fall back to the
  // user's saved brand_primary_color when they've explicitly customized
  // it away from the near-black default.
  const theme = getBrandTheme(deal.color_theme);
  const customPrimary =
    brand.brand_primary_color &&
    brand.brand_primary_color.toLowerCase() !== "#0f0f0f"
      ? brand.brand_primary_color
      : null;
  const accent = customPrimary || theme.from;
  const accent2 = theme.to;
  const accentGradient = `linear-gradient(135deg, ${accent} 0%, ${accent2} 100%)`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm grid place-items-center sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-4xl h-screen sm:h-[92vh] bg-card sm:rounded-2xl shadow-lift sm:border border-border flex flex-col overflow-hidden"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="size-2 rounded-full shrink-0" style={{ background: accent }} />
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Branded report
              </p>
              <h2 className="text-xs sm:text-sm font-bold truncate">
                <span className="hidden sm:inline">
                  {view === "edit"
                    ? "Edit in place · what you see is what exports"
                    : "Share with prospect"}
                </span>
                <span className="sm:hidden">
                  {view === "edit" ? "Edit" : "Share"}
                </span>
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Autosave status — no manual save needed */}
            <div
              aria-live="polite"
              className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </>
              ) : saveState === "dirty" ? (
                <>
                  <span className="size-1.5 rounded-full bg-amber-500" /> Unsaved
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3 text-emerald-500" /> Saved
                </>
              )}
            </div>

            {/* Report templates */}
            <div className="relative">
              <button
                onClick={() => {
                  refetchReportTemplates();
                  setShowTemplates((v) => !v);
                }}
                aria-label="Report templates"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition"
              >
                <BookMarked className="size-3.5" />
                <span className="hidden md:inline">Templates</span>
              </button>
              <AnimatePresence>
                {showTemplates && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTemplates(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card shadow-lift z-50 overflow-hidden"
                    >
                      <div className="px-3 py-2 border-b border-border">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                          Report templates
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Reusable language for your branded reports.
                        </p>
                      </div>
                      <div className="max-h-72 overflow-y-auto scrollbar-thin">
                        {reportTemplates.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-muted-foreground">
                            No saved templates yet.
                          </div>
                        ) : (
                          reportTemplates.map((t) => (
                            <div
                              key={t.id}
                              className="group flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/60"
                            >
                              <button
                                onClick={() => applyTemplate(t)}
                                className="flex-1 min-w-0 text-left"
                              >
                                <p className="text-xs font-medium truncate">{t.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  Updated {new Date(t.updated_at).toLocaleDateString()}
                                </p>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Delete template “${t.name}”?`)) {
                                    deleteTemplate(t.id);
                                  }
                                }}
                                aria-label="Delete template"
                                className="opacity-0 group-hover:opacity-100 size-6 grid place-items-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <button
                        onClick={saveAsTemplate}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border-t border-border hover:bg-muted/60 transition"
                      >
                        <Plus className="size-3.5" /> Save current as template
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={exportPDF}
              disabled={exporting}
              aria-label="Export PDF"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white rounded-md transition active:scale-95 disabled:opacity-60 hover:brightness-110 shadow-sm"
              style={{ background: accentGradient }}
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileDown className="size-3.5" />
              )}
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="size-8 grid place-items-center hover:bg-muted rounded-md"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* View segmented control */}
        <div className="px-3 sm:px-5 py-2 border-b border-border bg-muted/30 shrink-0">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-background border border-border">
            {(
              [
                { id: "edit", label: "Edit", icon: Pencil },
                { id: "share", label: "Share link", icon: Share2 },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = view === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setView(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider rounded-md transition",
                    active
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { background: accentGradient } : undefined}
                >
                  <Icon className="size-3" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div
          data-lenis-prevent
          className="flex-1 overflow-y-auto scrollbar-thin bg-muted/30 p-3 sm:p-8"
        >
          {view === "share" ? (
            <ShareView
              dealId={deal.id}
              prospectCompany={deal.prospect_company}
              accentGradient={accentGradient}
              accent={accent}
            />
          ) : (
            <PdfPreview
              data={data}
              brand={brand}
              deal={deal}
              computed={computed}
              scenario={scenario}
              template={template}
              accent={accent}
              accentGradient={accentGradient}
              edit={{ update, updateList, addItem, removeItem }}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────── Save as Template Modal ─────────────── */

function SaveTemplateModal({
  template,
  baseTemplate,
  onClose,
  onSave,
}: {
  template: Template;
  baseTemplate: Template | null;
  onClose: () => void;
  onSave: (input: { name: string; description: string }) => void | Promise<void>;
}) {
  const suggestedName = baseTemplate ? `${baseTemplate.name} — Custom` : template.name;
  const [name, setName] = useState(suggestedName);
  const [description, setDescription] = useState("");

  // Diff against the base template — only meaningful if we have one.
  const diff = useMemo(() => {
    if (!baseTemplate)
      return {
        added: [] as Field[],
        removed: [] as Field[],
        renamed: [] as { from: string; to: string }[],
      };
    const baseAll = [...baseTemplate.parameters, ...baseTemplate.returns];
    const nextAll = [...template.parameters, ...template.returns];
    const baseByKey = new Map(baseAll.map((f) => [f.key, f]));
    const nextByKey = new Map(nextAll.map((f) => [f.key, f]));
    const added = nextAll.filter((f) => !baseByKey.has(f.key));
    const removed = baseAll.filter((f) => !nextByKey.has(f.key));
    const renamed = nextAll.flatMap((f) => {
      const b = baseByKey.get(f.key);
      return b && b.label !== f.label ? [{ from: b.label, to: f.label }] : [];
    });
    return { added, removed, renamed };
  }, [template, baseTemplate]);

  const hasChanges = diff.added.length || diff.removed.length || diff.renamed.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-card shadow-lift ring-1 ring-black/5 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Save as template</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Reuse this configuration across future deals
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-md hover:bg-accent transition"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Template name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={
                baseTemplate
                  ? `Custom template based on ${baseTemplate.name}`
                  : "Describe when to use this template"
              }
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none resize-none"
            />
          </div>

          {baseTemplate && (
            <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Changes from {baseTemplate.name}
              </div>
              {!hasChanges ? (
                <p className="text-xs text-muted-foreground italic">
                  No structural changes — current input values will become the new defaults.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {diff.added.map((f) => (
                    <li key={`a-${f.key}`} className="flex items-center gap-2">
                      <span className="text-positive font-mono text-[10px]">+ ADD</span>
                      <span>{f.label}</span>
                    </li>
                  ))}
                  {diff.removed.map((f) => (
                    <li key={`r-${f.key}`} className="flex items-center gap-2">
                      <span className="text-destructive font-mono text-[10px]">− REMOVE</span>
                      <span className="line-through text-muted-foreground">{f.label}</span>
                    </li>
                  ))}
                  {diff.renamed.map((r, i) => (
                    <li key={`n-${i}`} className="flex items-center gap-2">
                      <span className="text-primary font-mono text-[10px]">~ RENAME</span>
                      <span className="text-muted-foreground line-through">{r.from}</span>
                      <span>→</span>
                      <span>{r.to}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-muted-foreground/70 pt-1">
                Current input values will be saved as the template's defaults.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-accent transition"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              name.trim() && onSave({ name: name.trim(), description: description.trim() })
            }
            disabled={!name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition active:scale-95 disabled:opacity-50"
          >
            <Save className="size-3.5" /> Save template
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
