import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface GooeyNavItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

export function GooeyNav({ items, className = "" }: { items: GooeyNavItem[]; className?: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <nav
      className={cn(
        "relative flex items-center gap-1.5 p-1 rounded-full bg-card/60 backdrop-blur-md border border-border/80 shadow-sm",
        className,
      )}
    >
      {/* SVG Gooey Filter definitions */}
      <svg className="hidden">
        <defs>
          <filter id="gooey-nav-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      {items.map((item, idx) => {
        const isHovered = hoveredIndex === idx;

        const handleClick = (e: React.MouseEvent) => {
          if (item.onClick) {
            item.onClick();
          }
        };

        const isPrimary = item.variant === "primary";

        return (
          <div
            key={idx}
            className="relative"
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {isHovered && (
              <motion.div
                layoutId="gooey-pill"
                className={cn(
                  "absolute inset-0 rounded-full blur-[1px]",
                  isPrimary
                    ? "bg-primary/90 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                    : "bg-primary/15 dark:bg-white/15 shadow-[0_0_15px_rgba(168,85,247,0.3)]",
                )}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}

            {item.href ? (
              <a
                href={item.href}
                onClick={handleClick}
                className={cn(
                  "relative z-10 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-colors",
                  isPrimary
                    ? "bg-primary text-primary-foreground shadow-sm hover:opacity-95"
                    : isHovered
                      ? "text-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleClick}
                className={cn(
                  "relative z-10 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-colors",
                  isPrimary
                    ? "bg-primary text-primary-foreground shadow-sm hover:opacity-95"
                    : isHovered
                      ? "text-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
