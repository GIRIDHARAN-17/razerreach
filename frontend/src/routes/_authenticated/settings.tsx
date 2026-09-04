import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  Settings,
  ShoppingCart,
  Sparkles,
  Search,
  Compass,
  History,
  ShoppingBag,
  LogOut,
  ArrowRight,
  ShieldCheck,
  User as UserIcon,
  Lock,
  Key,
} from "lucide-react";
import { authService } from "@/lib/aibuyer/authService";
import { cn } from "@/lib/utils";

import { MobileHeader } from "./app";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const user = authService.getUser();

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      <Sidebar activeNav="settings" onLogout={handleLogout} />
      <MobileHeader activeNav="settings" onLogout={handleLogout} />
      <main className="relative flex flex-1 flex-col min-w-0 p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Workspace Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your account identity and decision engine preferences
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

          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-md">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt="Profile"
                      className="size-full rounded-2xl object-cover"
                    />
                  ) : (
                    (user?.name?.[0] || "U").toUpperCase()
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{user?.name || "AI Buyer User"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {user?.email || "user@aibuyer.app"}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-border pt-4 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Authentication Provider</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    RazorReach JWT
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-xs text-foreground">{user?.id || "—"}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Role</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary capitalize">
                    {user?.role || "customer"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Session Token</span>
                  <span className="font-mono text-xs text-positive font-semibold">
                    Active & Encrypted
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Security & Privacy Guard</h3>
                  <p className="text-xs text-muted-foreground">
                    Data isolation and API credentials security
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  <span>
                    All search sessions and payment records are isolated strictly to your account.
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Key className="size-4 text-primary" />
                  <span>
                    Server-side secrets (MongoDB URI, Razorpay Secret) are never exposed to client
                    code.
                  </span>
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
                >
                  <LogOut className="size-4" />
                  Sign Out of AI Buyer
                </button>
              </div>
            </div>
          </div>
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
