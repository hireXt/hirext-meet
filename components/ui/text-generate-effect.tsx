'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export const TextGenerateEffect = ({
  words,
  className,
  typingSpeed = 15, // Milliseconds per character
}: {
  words: string;
  className?: string;
  typingSpeed?: number;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isDoneTyping, setIsDoneTyping] = useState(false);

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

    intervalRef.current = setInterval(() => {
      if (currentIndex < targetText.length) {
        textRef.current!.textContent += targetText[currentIndex];
        currentIndex++;
      } else {
        // Typing finished for the current chunk
        setIsDoneTyping(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, typingSpeed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [words, typingSpeed]);

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
