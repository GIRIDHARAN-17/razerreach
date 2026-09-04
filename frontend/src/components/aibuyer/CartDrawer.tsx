import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cartApi, type CartResponseData } from "@/lib/api/cartApi";
import { formatPrice } from "@/routes/_authenticated/app";

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceedToCheckout?: () => void;
  onCartChange?: () => void;
}

export function CartDrawer({
  open,
  onOpenChange,
  onProceedToCheckout,
  onCartChange,
}: CartDrawerProps) {
  const [cart, setCart] = useState<CartResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchCart = async () => {
    try {
      setLoading(true);
      const data = await cartApi.getCart();
      setCart(data);
    } catch (err) {
      console.warn("Could not fetch cart:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCart();
    }
  }, [open]);

  const handleUpdateQuantity = async (productId: string, newQty: number) => {
    if (newQty < 1) {
      await handleRemoveItem(productId);
      return;
    }
    try {
      setUpdatingId(productId);
      const updated = await cartApi.updateItem(productId, newQty);
      setCart(updated);
      onCartChange?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update item quantity");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (productId: string) => {
    try {
      setUpdatingId(productId);
      const updated = await cartApi.removeItem(productId);
      setCart(updated);
      toast.success("Item removed from cart");
      onCartChange?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove item");
    } finally {
      setUpdatingId(null);
    }
  };

  const totalItems = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md p-6">
        <SheetHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="size-4" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold tracking-tight">Your Cart</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {totalItems} {totalItems === 1 ? "item" : "items"} in cart
              </p>
            </div>
          </div>
        </SheetHeader>

        {loading && !cart ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : !cart || !cart.items || cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
              <ShoppingBag className="size-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Your cart is empty</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Search for products or tell AI Buyer what you need to add items to your cart.
            </p>
          </div>
        ) : (
          <>
            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto pr-1 py-4 space-y-3 scrollbar-thin">
              {cart.items.map((item) => {
                const isUpdating = updatingId === item.product_id;
                return (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-3"
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                          No Img
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h5 className="line-clamp-1 text-xs font-semibold text-foreground">
                        {item.name}
                      </h5>
                      <p className="text-xs font-bold text-primary mt-0.5">
                        {formatPrice(item.unit_price, cart.currency)}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border border-border rounded-md bg-background">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleUpdateQuantity(item.product_id, item.quantity - 1)}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="px-2 text-xs font-medium">
                            {isUpdating ? "…" : item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleUpdateQuantity(item.product_id, item.quantity + 1)}
                            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                            aria-label="Increase quantity"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleRemoveItem(item.product_id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          aria-label="Remove item"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-foreground">
                        {formatPrice(item.line_total, cart.currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Authoritative Backend Totals */}
            <div className="border-t border-border/60 pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatPrice(cart.subtotal, cart.currency)}</span>
              </div>
              {cart.tax > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatPrice(cart.tax, cart.currency)}</span>
                </div>
              )}
              {cart.delivery_fee > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Delivery</span>
                  <span>{formatPrice(cart.delivery_fee, cart.currency)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-bold text-foreground pt-2 border-t border-border/40">
                <span>Total</span>
                <span>{formatPrice(cart.total, cart.currency)}</span>
              </div>

              <div className="pt-3 space-y-2">
                {onProceedToCheckout ? (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onProceedToCheckout();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                  >
                    Proceed to Checkout
                    <ArrowRight className="size-3.5" />
                  </button>
                ) : (
                  <Link
                    to="/checkout"
                    onClick={() => onOpenChange(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                  >
                    Proceed to Checkout
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  <span>Verified prices and stock by RazorReach</span>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
