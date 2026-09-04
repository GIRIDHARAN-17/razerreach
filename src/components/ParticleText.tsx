import React, { useEffect, useRef } from "react";

export interface ParticleTextProps {
  text: string;
  particleSize?: number;
  density?: number;
  color?: string;
  highlightColor?: string;
  scatter?: boolean;
  gatherDuration?: number;
  stagger?: number;
  pointerRepel?: boolean;
  repelRadius?: number;
  idleDrift?: boolean;
  trigger?: boolean;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  glow?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  color: string;
  size: number;
  ease: number;
  angle: number;
}

export function ParticleText({
  text,
  particleSize = 2,
  density = 4,
  color = "#ffffff",
  highlightColor = "#38bdf8",
  scatter = false,
  gatherDuration = 1.2,
  pointerRepel = true,
  repelRadius = 80,
  idleDrift = true,
  fontSize = 64,
  fontWeight = "700",
  fontStyle = "normal",
  glow = true,
  className = "",
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    let startTime = performance.now();

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resizeAndInit = () => {
      const container = canvas.parentElement;
      const width = container ? container.clientWidth : 800;

      // Dynamically calculate responsive font size based on container width
      let computedFontSize = fontSize;
      if (width < 480) {
        computedFontSize = Math.min(
          fontSize,
          Math.max(34, Math.floor(width / (text.length * 0.58))),
        );
      } else if (width < 768) {
        computedFontSize = Math.min(
          fontSize,
          Math.max(48, Math.floor(width / (text.length * 0.52))),
        );
      } else if (width < 1024) {
        computedFontSize = Math.min(
          fontSize,
          Math.max(60, Math.floor(width / (text.length * 0.48))),
        );
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const height = Math.ceil(computedFontSize * 1.6);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      // Render text offscreen to sample particle points
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontStyle} ${fontWeight} ${computedFontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(text, width / 2, height / 2);

      const imageData = ctx.getImageData(0, 0, width * dpr, height * dpr);
      const data = imageData.data;
      particles = [];

      const step = Math.max(2, Math.floor(density * dpr));

      for (let y = 0; y < height * dpr; y += step) {
        for (let x = 0; x < width * dpr; x += step) {
          const index = (y * width * dpr + x) * 4;
          const alpha = data[index + 3];

          if (alpha > 128) {
            const targetX = x / dpr;
            const targetY = y / dpr;

            // Random initial scatter position
            const scatterDist = Math.max(width, height) * 0.8;
            const randAngle = Math.random() * Math.PI * 2;
            const initX = scatter
              ? targetX + Math.cos(randAngle) * scatterDist
              : targetX + (Math.random() - 0.5) * 60;
            const initY = scatter
              ? targetY + Math.sin(randAngle) * scatterDist
              : targetY + (Math.random() - 0.5) * 60;

            const isHighlight = Math.random() < 0.25;

            particles.push({
              x: initX,
              y: initY,
              originX: initX,
              originY: initY,
              vx: 0,
              vy: 0,
              targetX,
              targetY,
              color: isHighlight ? highlightColor : color,
              size: particleSize + (Math.random() - 0.5) * 0.8,
              ease: 0.05 + Math.random() * 0.08,
              angle: Math.random() * Math.PI * 2,
            });
          }
        }
      }

      startTime = performance.now();
    };

    resizeAndInit();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
          active: true,
        };
      }
    };

    window.addEventListener("resize", resizeAndInit);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchmove", handleTouchMove);

    // Animation Loop
    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const gatherProgress = Math.min(1, elapsed / gatherDuration);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.clearRect(0, 0, width, height);

      if (prefersReducedMotion) {
        // Fast static render for accessibility
        particles.forEach((p) => {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.targetX, p.targetY, p.size, p.size);
        });
        return;
      }

      if (glow) {
        ctx.shadowBlur = 6;
        ctx.shadowColor = highlightColor;
      } else {
        ctx.shadowBlur = 0;
      }

      const mouse = mouseRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Gather interpolate towards target
        let destX = p.targetX;
        let destY = p.targetY;

        // Subtle idle floating drift
        if (idleDrift && gatherProgress >= 0.8) {
          p.angle += 0.02;
          destX += Math.cos(p.angle + i) * 0.6;
          destY += Math.sin(p.angle + i) * 0.6;
        }

        // Pointer repel physics
        if (pointerRepel && mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < repelRadius && dist > 0) {
            const force = (1 - dist / repelRadius) * 18;
            destX -= (dx / dist) * force;
            destY -= (dy / dist) * force;
          }
        }

        p.x += (destX - p.x) * p.ease;
        p.y += (destY - p.y) * p.ease;

        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeAndInit);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, [
    text,
    particleSize,
    density,
    color,
    highlightColor,
    scatter,
    gatherDuration,
    pointerRepel,
    repelRadius,
    idleDrift,
    fontSize,
    fontWeight,
    fontStyle,
    glow,
  ]);

  return (
    <div
      className={`relative inline-flex items-center justify-center w-full max-w-full overflow-hidden ${className}`}
    >
      {/* Hidden screen-reader text for SEO and Accessibility */}
      <span className="sr-only">{text}</span>
      <canvas ref={canvasRef} className="block pointer-events-auto cursor-default mx-auto" />
    </div>
  );
}
