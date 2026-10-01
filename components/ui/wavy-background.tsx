"use client";
import { cn } from "@/lib/utils";
import React, { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise";

/**
 * Aceternity's WavyBackground, adapted for a bounded container.
 *
 * Changes from the demo, all required here:
 *  - the canvas is sized from its own bounding box via ResizeObserver, not
 *    `window.innerWidth/innerHeight` (the demo assumes a full-page hero);
 *  - `window.onresize` (a global assignment in the demo) is replaced with that
 *    observer;
 *  - the wrapper fills its parent instead of `h-screen`.
 *
 * All mutable props are read through a ref and the effect runs once. Passing a
 * value that changes every frame (e.g. audio-reactive opacity) must not
 * re-run the effect: resize() assigns canvas.width, and assigning width
 * CLEARS the canvas — a churn of effect runs would leave it blank.
 */
export const WavyBackground = ({
  children,
  className,
  containerClassName,
  colors,
  waveWidth,
  backgroundFill,
  blur = 10,
  speed = "fast",
  waveOpacity = 0.5,
  ...props
}: {
  children?: any;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  backgroundFill?: string;
  blur?: number;
  speed?: "slow" | "fast";
  waveOpacity?: number;
  [key: string]: any;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfg = useRef({ blur, speed, waveOpacity, waveWidth, backgroundFill, colors });
  cfg.current = { blur, speed, waveOpacity, waveWidth, backgroundFill, colors };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise = createNoise3D();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = { w: 0, h: 0 };
    let nt = 0;
    let frame: number | null = null;

    const waveColors = () =>
      cfg.current.colors ?? ["#2ee6a6", "#0fb59a", "#22d3a0", "#5cf5bd", "#0ea5e9"];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w === size.w && h === size.h) return;
      size.w = w;
      size.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.filter = `blur(${cfg.current.blur}px)`;
    };

    const paint = () => {
      const { w, h } = size;
      if (!w || !h) return;
      const palette = waveColors();
      ctx.globalAlpha = 1;
      ctx.fillStyle = cfg.current.backgroundFill || "#05070a";
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = Math.min(1, Math.max(0, cfg.current.waveOpacity));
      ctx.lineWidth = cfg.current.waveWidth || 50;

      const count = reduced ? 3 : 5;
      for (let n = 0; n < count; n++) {
        if (!reduced) nt += cfg.current.speed === "fast" ? 0.002 : 0.001;
        const idx = reduced ? n : Math.floor(nt * 100) % palette.length;
        ctx.beginPath();
        ctx.strokeStyle = palette[idx];
        for (let x = 0; x <= w; x += 5) {
          const y = noise(x / 800, 0.3 * n, nt) * 100;
          ctx.lineTo(x, y + h * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };

    resize();
    if (reduced) paint();
    else frame = requestAnimationFrame(loop);

    // Re-measure when the tile resizes (window resize, layout shift, grid change).
    const ro = new ResizeObserver(() => {
      resize();
      paint();
    });
    ro.observe(canvas);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden flex flex-col items-center justify-center",
        containerClassName
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className={cn("relative z-10", className)} {...props}>
        {children}
      </div>
    </div>
  );
};
