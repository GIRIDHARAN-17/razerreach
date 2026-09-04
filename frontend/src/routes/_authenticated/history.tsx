import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  History,
  ShoppingCart,
  Sparkles,
  Search,
  Compass,
  ShoppingBag,
  Settings,
  LogOut,
  ArrowRight,
  Calendar,
  Layers,
  Clock,
} from "lucide-react";
import { authService } from "@/lib/aibuyer/authService";
import { cn } from "@/lib/utils";

import { MobileHeader } from "./app";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

interface SearchSessionItem {
  session_id: string;
  created_at: string;
  conversation: Array<{ role: string; content: string }>;
  requirements: {
    brand?: string;
    product_type?: string;
    budget_max?: number;
    currency?: string;
  };
  recommendations: Array<any>;
}

function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SearchSessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const token = (await authService.getIdToken()) || localStorage.getItem("razorreach_token");
        const apiBase = import.meta.env.VITE_API_BASE_URL
          ? import.meta.env.VITE_API_BASE_URL.replace(/\/v1$/, "")
          : "http://localhost:8000/api";
        const targetUrl = apiBase.endsWith("/history") ? apiBase : `${apiBase}/history`;
        const res = await fetch(targetUrl, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch (err) {
        console.warn("Could not fetch history:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      <Sidebar activeNav="history" onLogout={handleLogout} />
      <MobileHeader activeNav="history" onLogout={handleLogout} />
      <main className="relative flex flex-1 flex-col min-w-0 p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Search History</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your past decision sessions and product evaluations
              </p>
            </div>
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:shadow"
            >
              New Search
              <ArrowRight className="size-4" />
            </Link>
          </div>

          {loading ? (
            <div className="mt-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border"
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <History className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">No recent sessions found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Evaluated queries and decision scores will appear here once you perform searches.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              {sessions.map((sess) => {
                const userQuery = sess.conversation?.[0]?.content || "Product Search";
                const dateStr = sess.created_at
                  ? new Date(sess.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recent";
                const recCount = sess.recommendations?.length || 0;

                return (
                  <div
                    key={sess.session_id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:shadow-lift sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        <span>{dateStr}</span>
                        <span className="font-mono opacity-50">· {sess.session_id}</span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground">"{userQuery}"</h3>
                      <div className="flex items-center gap-2 text-xs">
                        {sess.requirements?.brand && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            {sess.requirements.brand}
                          </span>
                        )}
                        {sess.requirements?.product_type && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                            {sess.requirements.product_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium">
                        <Layers className="size-3.5 text-muted-foreground" />
                        <span>
                          {recCount} Candidate{recCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Sidebar({ activeNav, onLogout }: { activeNav: string; onLogout: () => void }) {
  const navItems = [
    { key: "search", label: "New Search", icon: Search, href: "/app" },
    { key: "explore", label: "Explore", icon: Compass, href: "/app" },
    { key: "history", label: "History", icon: History, href: "/history" },
    { key: "cart", label: "Cart", icon: ShoppingCart, href: "/cart" },
    { key: "orders", label: "Orders", icon: ShoppingBag, href: "/orders" },
  ];

  const bottomItems = [{ key: "settings", label: "Settings", icon: Settings, href: "/settings" }];

  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-border bg-foreground p-5 text-background lg:flex z-30"
      style={{ background: "var(--gradient-results)" }}
    >
      <div>
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-background/10 text-background ring-1 ring-white/10">
            <Sparkles className="size-5" />
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">
            AI BUYER
          </span>
        </Link>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <Link
                key={item.key}
                to={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-1">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          return (
            <Link
              key={item.key}
              to={item.href}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
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
