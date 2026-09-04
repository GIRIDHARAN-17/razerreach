import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  Package,
  Store,
  Sparkles,
  Search,
  Compass,
  History,
  ShoppingBag,
  Settings,
  LogOut,
  Loader2,
  Menu,
} from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/aibuyer/authService";
import { cartApi, type CartResponseData, type CartItem } from "@/lib/api/cartApi";
import { formatPrice } from "./app";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/cart")({
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchCart = async () => {
    try {
      const data = await cartApi.getCart();
      setCart(data);
    } catch (err) {
      console.warn("Could not fetch cart:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleUpdateQuantity = async (productId: string, currentQty: number, delta: number) => {
    const newQty = currentQty + delta;
    if (newQty < 1) return;
    setUpdatingId(productId);
    try {
      const updated = await cartApi.updateItem(productId, newQty);
      setCart(updated);
      toast.success("Cart updated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update quantity";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (productId: string) => {
    setUpdatingId(productId);
    try {
      const updated = await cartApi.removeItem(productId);
      setCart(updated);
      toast.success("Item removed from cart");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not remove item";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearCart = async () => {
    setClearing(true);
    try {
      const updated = await cartApi.clearCart();
      setCart(updated);
      setShowClearConfirm(false);
      toast.success("Cart cleared");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not clear cart";
      toast.error(msg);
    } finally {
      setClearing(false);
    }
  };

  const handleProceedToCheckout = () => {
    if (!cart || cart.items.length === 0) return;
    navigate({ to: "/checkout" });
  };

  const totalItemsCount = cart ? cart.items.reduce((sum, i) => sum + i.quantity, 0) : 0;

  return (
    <div className="flex min-h-screen w-full bg-background flex-col lg:flex-row">
      <CartSidebar activeNav="cart" cartCount={totalItemsCount} onLogout={handleLogout} />
      <CartMobileHeader activeNav="cart" cartCount={totalItemsCount} onLogout={handleLogout} />

      <main className="relative flex flex-1 flex-col min-w-0 p-4 sm:p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
                <ShoppingCart className="size-6 text-primary" />
                Shopping Cart
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Review your selected products before checkout.
              </p>
            </div>
            {cart && cart.items.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="self-start sm:self-auto text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card"
              >
                <Trash2 className="size-3.5" />
                Clear Cart
              </button>
            )}
          </div>

          {/* Clear Confirmation Modal */}
          {showClearConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold">Clear your entire cart?</h3>
                <p className="text-sm text-muted-foreground">
                  All items currently in your shopping cart will be removed.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="rounded-lg border border-border px-4 py-2 text-xs font-semibold transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={handleClearCart}
                    className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {clearing && <Loader2 className="size-3.5 animate-spin" />}
                    Clear Cart
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-muted/40 animate-pulse border border-border"
                />
              ))}
            </div>
          ) : !cart || cart.items.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-border bg-card p-12 text-center shadow-card max-w-lg mx-auto">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShoppingCart className="size-7" />
              </div>
              <h3 className="mt-5 text-lg font-bold">Your cart is empty</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Products you select while exploring will appear here for review and checkout.
              </p>
              <Link
                to="/app"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Start Shopping
                <ArrowRight className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-8 lg:grid-cols-3 items-start">
              {/* Left Column: Cart Items List */}
              <div className="lg:col-span-2 space-y-4">
                {cart.items.map((item: CartItem) => {
                  const isItemBusy = updatingId === item.product_id;
                  const itemPriceFormatted = formatPrice(item.unit_price, cart.currency);
                  const lineTotalFormatted = formatPrice(item.line_total, cart.currency);

                  return (
                    <div
                      key={item.product_id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:border-border/80"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        {/* Thumbnail */}
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30 flex items-center justify-center">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="size-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&auto=format&fit=crop&q=80";
                              }}
                            />
                          ) : (
                            <Package className="size-7 text-muted-foreground/60" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {item.name}
                          </h3>
                          <div className="text-xs font-mono text-muted-foreground">
                            {itemPriceFormatted} each
                          </div>
                          {item.stock_available === false && (
                            <span className="inline-block text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                              Limited stock
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Controls & Price */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-border">
                        {/* Quantity Increment/Decrement */}
                        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 gap-1">
                          <button
                            type="button"
                            disabled={isItemBusy || item.quantity <= 1}
                            onClick={() => handleUpdateQuantity(item.product_id, item.quantity, -1)}
                            className="flex size-7 items-center justify-center rounded-md hover:bg-background text-foreground transition-colors disabled:opacity-30"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-8 text-center font-mono text-xs font-bold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isItemBusy}
                            onClick={() => handleUpdateQuantity(item.product_id, item.quantity, 1)}
                            className="flex size-7 items-center justify-center rounded-md hover:bg-background text-foreground transition-colors disabled:opacity-30"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="text-right min-w-[80px]">
                          <div className="text-sm font-bold text-foreground">
                            {lineTotalFormatted}
                          </div>
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          disabled={isItemBusy}
                          onClick={() => handleRemoveItem(item.product_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                        >
                          {isItemBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Order Summary */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-5">
                <h2 className="text-lg font-bold tracking-tight border-b border-border pb-4">
                  Order Summary
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal ({totalItemsCount} items)</span>
                    <span className="font-mono text-foreground font-semibold">
                      {formatPrice(cart.subtotal, cart.currency)}
                    </span>
                  </div>

                  {cart.delivery_fee > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Estimated Shipping</span>
                      <span className="font-mono text-foreground font-semibold">
                        {formatPrice(cart.delivery_fee, cart.currency)}
                      </span>
                    </div>
                  )}

                  {cart.tax > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Tax</span>
                      <span className="font-mono text-foreground font-semibold">
                        {formatPrice(cart.tax, cart.currency)}
                      </span>
                    </div>
                  )}

                  {cart.discount > 0 && (
                    <div className="flex items-center justify-between text-positive font-semibold">
                      <span>Discount</span>
                      <span className="font-mono">
                        -{formatPrice(cart.discount, cart.currency)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-border pt-3 flex items-center justify-between text-base font-bold">
                    <span>Total</span>
                    <span className="font-mono text-primary text-lg">
                      {formatPrice(cart.total, cart.currency)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleProceedToCheckout}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 px-6 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Proceed to Checkout
                  <ArrowRight className="size-4" />
                </button>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>Razorpay Secure Test Verification</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function CartSidebar({
  activeNav,
  cartCount,
  onLogout,
}: {
  activeNav: string;
  cartCount?: number;
  onLogout: () => void;
}) {
  const navItems = [
    { key: "search", label: "New Search", icon: Search, href: "/app" },
    { key: "explore", label: "Explore", icon: Compass, href: "/app" },
    { key: "history", label: "History", icon: History, href: "/history" },
    { key: "cart", label: "Cart", icon: ShoppingCart, href: "/cart", badge: cartCount },
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
                  "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </div>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {item.badge}
                  </span>
                )}
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

export function CartMobileHeader({
  activeNav,
  cartCount,
  onLogout,
}: {
  activeNav: string;
  cartCount?: number;
  onLogout: () => void;
}) {
  const navItems = [
    { key: "search", label: "New Search", icon: Search, href: "/app" },
    { key: "explore", label: "Explore", icon: Compass, href: "/app" },
    { key: "history", label: "History", icon: History, href: "/history" },
    { key: "cart", label: "Cart", icon: ShoppingCart, href: "/cart", badge: cartCount },
    { key: "orders", label: "Orders", icon: ShoppingBag, href: "/orders" },
    { key: "settings", label: "Settings", icon: Settings, href: "/settings" },
  ];

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <span className="font-mono text-xs font-bold tracking-widest text-foreground">
          AI BUYER
        </span>
      </Link>
      <Sheet>
        <SheetTrigger asChild>
          <button className="rounded-lg border border-border p-2 text-foreground transition-colors hover:bg-muted">
            <Menu className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 bg-foreground text-background border-r border-border p-6 flex flex-col justify-between"
        >
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-background/10 text-background ring-1 ring-white/10">
                <Sparkles className="size-4" />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-90 text-white">
                AI BUYER
              </span>
            </div>
            <nav className="mt-8 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.key;
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-white/10 text-white font-semibold"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </div>
                    {Boolean(item.badge && item.badge > 0) && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </SheetContent>
      </Sheet>
    </header>
  );
}
