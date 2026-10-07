'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export const TextGenerateEffect = ({
  words,
  className,
  typingSpeed = 15, // Milliseconds per character
  durationMs,
  interrupted = false,
}: {
  words: string;
  className?: string;
  typingSpeed?: number;
  /**
   * Length of the spoken audio for this line. When given, the typing is paced so
   * it finishes at roughly the same moment the voice does, instead of at a fixed
   * characters-per-millisecond rate that drifts out of sync with longer lines.
   */
  durationMs?: number;
  /**
   * True once the listener has interrupted playback. Typing stops dead and the
   * line is left truncated at whatever was actually revealed, so the transcript
   * never keeps "talking" over someone who has already answered.
   */
  interrupted?: boolean;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isDoneTyping, setIsDoneTyping] = useState(false);
  // Read inside the interval without re-creating it on every keystroke.
  const interruptedRef = useRef(interrupted);
  interruptedRef.current = interrupted;

  useEffect(() => {
    if (!textRef.current) return;

    const targetText = Array.from(words);
    const currentString = textRef.current.textContent || '';

    // Check if LiveKit is continuing gracefully or if it corrected a past word
    const isContinuing = words.startsWith(currentString);

    if (!isContinuing) {
      // Hard snap for corrections
      textRef.current.textContent = words;
      setIsDoneTyping(true);
      return;
    }

    let currentIndex = currentString.length;

    // If we're already caught up, hide the cursor and do nothing
    if (currentIndex >= targetText.length) {
      setIsDoneTyping(true);
      return;
    }

    // Otherwise, ensure the cursor is visible because we have typing to do
    setIsDoneTyping(false);

    if (intervalRef.current) clearInterval(intervalRef.current);

    // Pace to the audio when we know how long it is. Never faster than 8ms per
    // character, otherwise a long line driven by a long duration turns into a
    // blur rather than a reveal.
    const remaining = targetText.length - currentIndex;
    const perChar =
      durationMs && durationMs > 0 && remaining > 0
        ? Math.max(8, durationMs / remaining)
        : typingSpeed;

    intervalRef.current = setInterval(() => {
      if (interruptedRef.current) {
        setIsDoneTyping(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      if (currentIndex < targetText.length) {
        textRef.current!.textContent += targetText[currentIndex];
        currentIndex++;
      } else {
        // Typing finished for the current chunk
        setIsDoneTyping(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, perChar);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [words, typingSpeed, durationMs]);

  return (
    <div className={cn('inline-block relative text-left leading-relaxed', className)}>
      {/* The text container */}
      <span ref={textRef} className="inline whitespace-pre-wrap"></span>

      {/* Blue bot cursor subscript - only renders when actively typing */}
      {!isDoneTyping && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          className="inline-block w-2 aspect-square mt-2 ml-1 bg-blue-500 align-middle -translate-y-[0.1em] rounded-full"
        />
      )}
    </div>
  );
};
