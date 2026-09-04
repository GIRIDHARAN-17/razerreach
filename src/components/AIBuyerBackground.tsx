import { motion } from "framer-motion";

export function AIBuyerBackground({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: "var(--gradient-results)" }}
    >
      {/* Fine grid lines overlay with radial vignette mask */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(120% 80% at 30% 20%, black 30%, transparent 75%)",
        }}
      />

      {/* Blue Radial Glow Blob (Upper Left) */}
      <motion.div
        aria-hidden
        animate={{ y: [0, -18, 0], x: [0, 10, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -left-16 top-24 size-72 rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--primary) 55%, transparent)" }}
      />

      {/* Cyan/Teal Radial Glow Blob (Lower Right) */}
      <motion.div
        aria-hidden
        animate={{ y: [0, 22, 0], x: [0, -14, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute bottom-12 right-0 size-80 rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--metric-accent) 40%, transparent)" }}
      />

      {/* Overlaid content */}
      {children}
    </div>
  );
}
