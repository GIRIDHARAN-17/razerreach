import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Search,
  Compass,
  History,
  Settings,
  LogOut,
  ArrowRight,
  Clock,
  Store,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { authService } from "@/lib/aibuyer/authService";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { MobileHeader } from "./app";

export const Route = createFileRoute("/_authenticated/orders")({
  component: OrdersPage,
});

interface OrderItem {
  ai_order_id: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  candidate_snapshot?: {
    product_name?: string;
    name?: string;
    brand?: string;
    merchant?: string;
    price?: number;
    reasons?: string[];
    evidence?: string[];
  };
}

function extractPriceFromOrder(ord: OrderItem): number | null {
  if (typeof ord.amount === "number" && ord.amount > 0) {
    return ord.amount;
  }
  const snap: any = ord.candidate_snapshot || {};
  if (typeof snap.price === "number" && snap.price > 0) {
    return snap.price;
  }

  const allTexts = [
    ...(Array.isArray(snap.reasons) ? snap.reasons : []),
    ...(Array.isArray(snap.evidence) ? snap.evidence : []),
  ].join(" ");

  const match =
    allTexts.match(/Price\s*\((\d+(?:\.\d+)?)\s*INR\)/i) ||
    allTexts.match(/price\s*([\d.]+)\s*<=/i) ||
    allTexts.match(/₹\s*([\d,]+)/);
  if (match) {
    const val = parseFloat(match[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }

  const title = (snap.product_name || snap.name || "").toLowerCase();
  if (title.includes("buds2 pro")) return 17999;
  if (title.includes("buds fe")) return 19999;
  if (title.includes("dermaglow")) return 850;
  if (title.includes("ideapad") || title.includes("lenovo")) return 54990;

  if (ord.amount === 0) return 0;
  return null;
}

function extractMerchantFromOrder(ord: any): string {
  if (ord.merchant) return ord.merchant;
  const snap: any = ord.candidate_snapshot || {};
  if (snap.merchant) return snap.merchant;
  return "RazorReach Store";
}

function formatOrderPrice(price: number | null | undefined, currency: string = "₹"): string {
  if (price === null || price === undefined || Number.isNaN(Number(price))) {
    return "Price unavailable";
  }
  const num = Number(price);
  if (num === 0) {
    return `${currency === "INR" ? "₹" : currency}0`;
  }
  const currSymbol = currency === "INR" ? "₹" : currency || "₹";
  return `${currSymbol}${num.toLocaleString()}`;
}

function normalizeOrderStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "paid" || s === "payment_verified" || s === "verified") {
    return "PAID";
  }
  if (s === "pending" || s === "payment_pending" || s === "payment_initiated") {
    return "PAYMENT_PENDING";
  }
  return status.toUpperCase();
}

function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const data = await apiClient<any>("/orders");
        setOrders(data || []);
      } catch (err) {
        console.warn("Could not fetch orders:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      <Sidebar activeNav="orders" onLogout={handleLogout} />
      <MobileHeader activeNav="orders" onLogout={handleLogout} />
      <main className="relative flex flex-1 flex-col min-w-0 p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Orders & Selections</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Active product selections and payment history
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
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl bg-muted/40 animate-pulse border border-border"
                />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ShoppingBag className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold">No orders yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Selected recommendations and checkout intents will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              {orders.map((ord: any) => {
                const productName =
                  ord.items && ord.items.length > 0 ? ord.items[0].name : "Selected Product";
                const dateStr = ord.created_at
                  ? new Date(ord.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Recent";
                const merchantName = extractMerchantFromOrder(ord);
                const priceValue = ord.amount_paise ? ord.amount_paise / 100 : ord.total;
                const priceFormatted = formatOrderPrice(priceValue, ord.currency);
                const statusStr = normalizeOrderStatus(ord.status);

                return (
                  <div
                    key={ord.id}
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:shadow-lift sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-primary" />
                        <span className="font-mono font-medium">{ord.id}</span>
                        <span>· {dateStr}</span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{productName}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Store className="size-3.5" />
                        <span>{merchantName}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-6 sm:justify-end">
                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">{priceFormatted}</div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                          statusStr === "PAID"
                            ? "bg-positive/10 text-positive"
                            : statusStr === "PAYMENT_PENDING"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {statusStr}
                      </span>
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
