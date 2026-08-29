import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { getSharedDeal } from "@/lib/share.functions";
import { compute } from "@/lib/calc";
import type { Deal, Template, Field } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/share/$dealId")({ component: SharePage });

type ScenarioKey = "conservative" | "expected" | "optimistic";
const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: "conservative", label: "Conservative" },
  { key: "expected", label: "Expected" },
  { key: "optimistic", label: "Optimistic" },
];

function themeColors(id: string | null | undefined): { from: string; to: string } {
  if (id && id.startsWith("custom:")) {
    const [, from = "#6366f1", to = "#1d4ed8"] = id.split(":");
    return { from, to };
  }
  const map: Record<string, { from: string; to: string }> = {
    indigo: { from: "#6366f1", to: "#1d4ed8" },
    orange: { from: "#fb923c", to: "#c2410c" },
    emerald: { from: "#10b981", to: "#047857" },
    crimson: { from: "#ef4444", to: "#991b1b" },
    violet: { from: "#a855f7", to: "#6b21a8" },
    teal: { from: "#14b8a6", to: "#0f766e" },
    rose: { from: "#f43f5e", to: "#9f1239" },
    slate: { from: "#475569", to: "#0f172a" },
  };
  return map[id ?? "indigo"] ?? map.indigo;
}

function SharePage() {
  const { dealId } = Route.useParams();
  const fetchSharedDeal = useServerFn(getSharedDeal);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [brand, setBrand] = useState<{ company_name: string; brand_logo_url: string | null }>({
    company_name: "",
    brand_logo_url: null,
  });
  const [scenario, setScenario] = useState<ScenarioKey>("expected");
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchSharedDeal({ data: { dealId } });
        if (!res.deal || !res.template) {
          setError("This calculator is not available.");
          return;
        }
        const deal = res.deal as unknown as Deal;
        const tpl = res.template as unknown as Template;
        if (res.brand) {
          setBrand({
            company_name: res.brand.company_name || "",
            brand_logo_url: res.brand.brand_logo_url ?? null,
          });
        }
        const initial: Record<string, number> = {};
        for (const f of [...(tpl.parameters ?? []), ...(tpl.returns ?? [])]) {
          initial[f.key] = deal.values?.[f.key] ?? f.default;
        }
        setValues(initial);
        setScenario(deal.scenario || "expected");
        setDeal(deal);
        setTemplate(tpl);
      } catch (e) {
        console.error(e);
        setError("Could not load this calculator.");
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId, fetchSharedDeal]);

  const computed = useMemo(() => {
    if (!template) return null;
    const mult = template.scenarios[scenario] ?? 1;
    return compute(template, values, mult);
  }, [template, values, scenario]);

  const theme = themeColors(deal?.color_theme);
  const pBrand = deal?.prospect_brand ?? null;
  const primary = pBrand?.primary || theme.from;
  const secondary = pBrand?.secondary || theme.to;
  const accent = `linear-gradient(135deg, ${primary}, ${secondary})`;
  const headingFont = pBrand?.headingFont?.trim() || "";
  const bodyFont = pBrand?.bodyFont?.trim() || "";

  // Load prospect brand fonts from Google Fonts
  useEffect(() => {
    const families = [headingFont, bodyFont].filter(Boolean);
    if (!families.length) return;
    const id = "share-prospect-fonts";
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
  }, [headingFont, bodyFont]);

  const headingStyle = headingFont ? { fontFamily: `"${headingFont}", ui-sans-serif, system-ui` } : undefined;
  const bodyStyle = bodyFont ? { fontFamily: `"${bodyFont}", ui-sans-serif, system-ui` } : undefined;

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground">
        <Loader2 className="size-6 animate-spin opacity-60" />
      </div>
    );
  }

  if (error || !deal || !template || !computed) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <div className="text-center max-w-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Unavailable
          </p>
          <h1 className="text-xl font-bold mt-2">{error || "Calculator not found"}</h1>
          <Link to="/" className="inline-block mt-4 text-sm underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const prospect = deal.prospect_company || "Your business";

  return (
    <div className="min-h-screen bg-background text-foreground" style={bodyStyle}>
      {/* Header */}
      <header className="border-b border-border relative overflow-hidden">
        <div className="h-1" style={{ background: accent }} />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ background: `radial-gradient(circle at 85% 0%, ${primary}, transparent 60%)` }}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 relative">
          {/* Prospect */}
          <div className="flex items-center gap-3 min-w-0">
            {(deal.prospect_logo_url || pBrand?.logo) ? (
              <img
                src={(deal.prospect_logo_url || pBrand?.logo) as string}
                alt={prospect}
                className="h-9 max-w-[140px] object-contain shrink-0"
              />
            ) : (
              <div className="size-9 rounded-md shrink-0" style={{ background: accent }} />
            )}
            <div className="min-w-0">
              <p
                className="font-mono text-[9px] uppercase tracking-[0.25em]"
                style={{ color: primary }}
              >
                Prepared for
              </p>
              <p className="text-sm font-bold truncate" style={headingStyle}>{prospect}</p>
            </div>
          </div>
          {/* Divider */}
          <div className="h-8 w-px bg-border" />
          {/* Your company */}
          <div className="flex items-center gap-3 min-w-0 justify-end text-right">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Presented by
              </p>
              <p className="text-sm font-bold truncate">{brand.company_name || "Your team"}</p>
            </div>
            {brand.brand_logo_url ? (
              <img src={brand.brand_logo_url} alt={brand.company_name} className="h-9 object-contain shrink-0" />
            ) : (
              <div className="size-9 rounded-md bg-muted shrink-0" />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-5 gap-6">
        {/* Inputs */}
        <section className="lg:col-span-3 space-y-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Interactive Business Case
            </p>
            <h2 className="text-2xl font-bold mt-1" style={headingStyle}>
              Adjust the numbers
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Move any slider to see how the projected return changes in real time. Nothing here is saved.
            </p>
          </div>

          <Group title="Your inputs" fields={template.parameters ?? []} values={values} setValues={setValues} accent={accent} />
          <Group title="Expected returns" fields={template.returns ?? []} values={values} setValues={setValues} accent={accent} />
        </section>

        {/* Results */}
        <aside className="lg:col-span-2">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: accent }}>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-80">Projected ROI</p>
              <div className="text-4xl font-bold mt-1 tabular-nums">
                {Number.isFinite(computed.roiPercent) ? formatPercent(computed.roiPercent) : "—"}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <Metric label="Annual gain" value={formatCurrency(computed.annualGain)} />
                <Metric label="Annual cost" value={formatCurrency(computed.annualCost)} />
                <Metric label="3-yr value" value={formatCurrency(computed.threeYearValue)} />
                <Metric
                  label="Payback"
                  value={
                    Number.isFinite(computed.paybackMonths)
                      ? `${formatNumber(computed.paybackMonths, 1)} mo`
                      : "—"
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Scenario
              </p>
              <div className="grid grid-cols-3 gap-1 bg-muted rounded-lg p-1">
                {SCENARIOS.map((s) => {
                  const active = scenario === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setScenario(s.key)}
                      className={`relative text-xs font-medium py-1.5 rounded-md transition ${
                        active ? "text-white" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="share-scenario"
                          className="absolute inset-0 rounded-md"
                          style={{ background: accent }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="border-t border-border mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-[11px] text-muted-foreground text-center">
          Prepared by {brand.company_name || "your team"} · Interactive estimate, not a contract.
        </div>
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function Group({
  title,
  fields,
  values,
  setValues,
  accent,
}: {
  title: string;
  fields: Field[];
  values: Record<string, number>;
  setValues: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  accent: string;
}) {
  if (!fields.length) return null;
  return (
    <div className="rounded-2xl border border-border p-5">
      <h3 className="text-sm font-bold mb-4">{title}</h3>
      <div className="space-y-5">
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            field={f}
            value={values[f.key] ?? f.default}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            accent={accent}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  accent,
}: {
  field: Field;
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? Math.max(value * 4, 100);
  const step = field.step ?? 1;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const display =
    field.type === "currency"
      ? formatCurrency(value)
      : field.type === "percent"
      ? formatPercent(value, value < 10 ? 1 : 0)
      : `${formatNumber(value)}${field.unit ? ` ${field.unit}` : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium">{field.label}</label>
        <span className="text-sm font-bold tabular-nums">{display}</span>
      </div>
      {field.help ? <p className="text-[11px] text-muted-foreground mt-0.5">{field.help}</p> : null}
      <div className="relative mt-3 h-2 rounded-full bg-muted">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: accent }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={field.label}
        />
      </div>
    </div>
  );
}
