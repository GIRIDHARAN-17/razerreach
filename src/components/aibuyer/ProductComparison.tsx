import { Check, ShoppingCart, Sparkles, Store } from "lucide-react";
import type { Recommendation } from "@/lib/aibuyer/types";
import { formatPrice } from "@/routes/_authenticated/app";
import { cn } from "@/lib/utils";

interface ProductComparisonProps {
  products: Recommendation[];
  selectedProductId?: string;
  onSelectProduct: (recommendation: Recommendation) => void;
  onAddToCart?: (productId: string) => Promise<void>;
  isAddingToCart?: string | null;
}

export function ProductComparison({
  products,
  selectedProductId,
  onSelectProduct,
  onAddToCart,
  isAddingToCart,
}: ProductComparisonProps) {
  if (!products || products.length === 0) return null;

  // Bounded at 5 per Section 14
  const displayProducts = products.slice(0, 5);

  return (
    <div className="w-full my-4 rounded-2xl border border-border bg-card/80 p-4 sm:p-6 shadow-sm backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Side-by-Side Comparison
            </h3>
            <p className="text-xs text-muted-foreground">
              Comparing {displayProducts.length} candidate options
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          displayProducts.length === 2
            ? "grid-cols-1 sm:grid-cols-2"
            : displayProducts.length === 3
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        {displayProducts.map((rec, index) => {
          const p = rec.product;
          const isSelected = selectedProductId === p.id;
          const isAdding = isAddingToCart === p.id;

          return (
            <div
              key={rec.id || `comp-${index}`}
              className={cn(
                "relative flex flex-col justify-between rounded-xl border bg-background/90 p-4 transition-all duration-200",
                isSelected
                  ? "border-primary shadow-md ring-1 ring-primary/30"
                  : "border-border hover:border-border/80"
              )}
            >
              {/* Product Header & Index Badge */}
              <div>
                <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg bg-muted/40">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      No Image
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-bold backdrop-blur-md">
                    Option {index + 1}
                  </span>
                  {isSelected && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
                      <Check className="size-3" /> Selected
                    </span>
                  )}
                </div>

                <h4 className="line-clamp-2 text-sm font-semibold text-foreground" title={p.name}>
                  {p.name}
                </h4>

                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Store className="size-3" />
                  <span className="truncate">{p.merchant || "RazorReach Store"}</span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-base font-bold text-foreground">
                    {formatPrice(p.price, p.currency)}
                  </span>
                </div>

                {/* Grounded Features / Differences */}
                <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Highlights
                  </span>
                  <ul className="space-y-1">
                    {(rec.decision.reasons && rec.decision.reasons.length > 0
                      ? rec.decision.reasons
                      : p.features || []
                    )
                      .slice(0, 3)
                      .map((feat, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-xs text-muted-foreground"
                        >
                          <span className="mt-1 size-1 rounded-full bg-primary/60 shrink-0" />
                          <span className="line-clamp-2">{feat}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onSelectProduct(rec)}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-muted/50 hover:bg-muted text-foreground"
                  )}
                >
                  {isSelected ? (
                    <>
                      <Check className="size-3.5" /> Selected
                    </>
                  ) : (
                    `Select Option ${index + 1}`
                  )}
                </button>

                {onAddToCart && (
                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={() => onAddToCart(p.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    <ShoppingCart className="size-3.5" />
                    {isAdding ? "Adding..." : "Add to Cart"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
