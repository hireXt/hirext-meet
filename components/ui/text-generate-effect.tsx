"use client";
import { useEffect } from "react";
import { motion, stagger, useAnimate } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Aceternity's TextGenerateEffect.
 *
 * Changes from the demo, needed for a live transcript:
 *  - the hardcoded `font-bold` / `text-2xl` / `dark:text-white` wrapper is
 *    gone; sizing and colour come from `className` so it inherits the
 *    transcript's type styles (the demo's defaults rendered invisible text on
 *    this dark screen);
 *  - it re-runs on `words` change, not just on mount, because LiveKit
 *    transcriptions update in place as speech is recognised;
 *  - `stagger(0.2)` was far too slow for a spoken sentence, so the per-word
 *    delay is a prop.
 */
export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.5,
  staggerDelay = 0.045,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
  staggerDelay?: number;
}) => {
  const [scope, animate] = useAnimate();
  const wordsArray = words.split(" ");

  useEffect(() => {
    const controls = animate(
      "span",
      { opacity: 1, filter: filter ? "blur(0px)" : "none" },
      { duration, delay: stagger(staggerDelay) }
    );
    return () => controls.stop();
  }, [words, scope, animate, filter, duration, staggerDelay]);

  return (
    <div className={cn("inline-block", className)}>
      <motion.div ref={scope} className="inline">
        {wordsArray.map((word, idx) => (
          <motion.span
            key={word + idx}
            className="inline opacity-0"
            style={filter ? { filter: "blur(6px)" } : undefined}
          >
            {word}
            {idx < wordsArray.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
};
