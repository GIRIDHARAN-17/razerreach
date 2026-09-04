import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";

export interface AnimatedContentProps {
  children: React.ReactNode;
  distance?: number;
  direction?: "vertical" | "horizontal";
  duration?: number;
  delay?: number;
  threshold?: number;
  opacity?: number;
  scale?: number;
  className?: string;
}

export function AnimatedContent({
  children,
  distance = 50,
  direction = "vertical",
  duration = 0.8,
  delay = 0,
  threshold = 0.15,
  opacity = 0,
  scale = 1,
  className = "",
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { amount: threshold, once: true });

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const initialY = direction === "vertical" ? distance : 0;
  const initialX = direction === "horizontal" ? distance : 0;

  return (
    <motion.div
      ref={ref}
      initial={{
        opacity,
        y: initialY,
        x: initialX,
        scale,
      }}
      animate={
        isInView
          ? { opacity: 1, y: 0, x: 0, scale: 1 }
          : { opacity, y: initialY, x: initialX, scale }
      }
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
