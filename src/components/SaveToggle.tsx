import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { BsCheckCircleFill } from 'react-icons/bs';

export type SaveButtonStatus = 'idle' | 'loading' | 'success' | 'saved';
export type SaveButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CONFIG: Record<
  SaveButtonSize,
  {
    height: number;
    circleWidth: number;
    idleWidth: number;
    savedWidth: number;
    text: string;
    icon: string;
    spinner: string;
    gap: string;
    padding: string;
  }
> = {
  xs: {
    height: 36,
    circleWidth: 36,
    idleWidth: 142,
    savedWidth: 124,
    text: 'text-xs',
    icon: 'text-base',
    spinner: 'w-5 h-5',
    gap: 'gap-1.5',
    padding: 'px-3.5',
  },
  sm: {
    height: 52,
    circleWidth: 52,
    idleWidth: 108,
    savedWidth: 128,
    text: 'text-[18px]',
    icon: 'text-2xl',
    spinner: 'w-7 h-7',
    gap: 'gap-2',
    padding: 'px-4',
  },
  md: {
    height: 56,
    circleWidth: 56,
    idleWidth: 120,
    savedWidth: 140,
    text: 'text-[20px]',
    icon: 'text-3xl',
    spinner: 'w-8 h-8',
    gap: 'gap-3',
    padding: 'px-5',
  },
  lg: {
    height: 68,
    circleWidth: 68,
    idleWidth: 144,
    savedWidth: 168,
    text: 'text-[22px]',
    icon: 'text-[28px]',
    spinner: 'w-9 h-9',
    gap: 'gap-4',
    padding: 'px-5',
  },
};

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

function useHtmlDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export interface SaveToggleProps {
  size?: SaveButtonSize;
  idleText?: string;
  savedText?: string;
  loadingDuration?: number;
  successDuration?: number;
  autoResetDelay?: number;
  idleWidth?: number;
  savedWidth?: number;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Optional async/sync save action. Returning false or throwing aborts and resets to idle. */
  onSave?: () => Promise<boolean | void> | boolean | void;
  /** Incrementing this counter triggers the save animation & onSave (useful on form submit). */
  triggerCount?: number;
  /** Changing this key resets the button back to idle (e.g. when inputs are edited). */
  resetKey?: string | number;
  onStatusChange?: (status: SaveButtonStatus) => void;
}

export const SaveToggle: React.FC<SaveToggleProps> = ({
  size = 'md',
  idleText = 'Save',
  savedText = 'Saved',
  loadingDuration = 1050,
  successDuration = 850,
  autoResetDelay = 2500,
  idleWidth,
  savedWidth,
  type = 'button',
  disabled = false,
  className,
  ariaLabel,
  onSave,
  triggerCount = 0,
  resetKey,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<SaveButtonStatus>('idle');
  const isDark = useHtmlDarkMode();
  const mountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const lastTriggerRef = useRef(triggerCount);
  const prevResetKeyRef = useRef(resetKey);
  const runningRef = useRef(false);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const cfg = SIZE_CONFIG[size];
  const resolvedIdleWidth = idleWidth ?? cfg.idleWidth;
  const resolvedSavedWidth = savedWidth ?? cfg.savedWidth;
  const stableWidth = Math.max(resolvedIdleWidth, resolvedSavedWidth);

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      if (status === 'saved' && !runningRef.current) {
        clearAllTimers();
        setStatus('idle');
      }
    }
  }, [resetKey, status, clearAllTimers]);

  const runSaveFlow = useCallback(async () => {
    if (disabled || runningRef.current) return;

    clearAllTimers();
    runningRef.current = true;
    setStatus('loading');

    const startTime = Date.now();
    let ok = true;

    if (onSaveRef.current) {
      try {
        const result = await onSaveRef.current();
        if (result === false) {
          ok = false;
        }
      } catch {
        ok = false;
      }
    }

    if (!mountedRef.current) return;

    if (!ok) {
      runningRef.current = false;
      setStatus('idle');
      return;
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, loadingDuration - elapsed);

    const t1 = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setStatus('success');

      const t2 = window.setTimeout(() => {
        if (!mountedRef.current) return;
        runningRef.current = false;
        setStatus('saved');

        if (autoResetDelay > 0) {
          const t3 = window.setTimeout(() => {
            if (!mountedRef.current) return;
            setStatus('idle');
          }, autoResetDelay);
          timersRef.current.push(t3);
        }
      }, successDuration);
      timersRef.current.push(t2);
    }, remaining);

    timersRef.current.push(t1);
  }, [disabled, clearAllTimers, loadingDuration, successDuration, autoResetDelay]);

  useEffect(() => {
    if (triggerCount > lastTriggerRef.current) {
      lastTriggerRef.current = triggerCount;
      void runSaveFlow();
    }
  }, [triggerCount, runSaveFlow]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || runningRef.current) {
      e.preventDefault();
      return;
    }

    if (type === 'submit' && onSave) {
      // Let form submit handler drive via triggerCount or call directly if no form
      return;
    }

    if (status === 'idle' || status === 'saved') {
      void runSaveFlow();
    }
  };

  const isCircle = status === 'loading' || status === 'success';

  const getBackgroundColor = () => {
    if (status === 'loading' || status === 'success') {
      return isDark ? '#ffffff' : '#18181b';
    }
    if (status === 'saved') {
      return isDark ? '#27272a' : '#ffffff';
    }
    return isDark ? '#27272a' : '#E8E7E0';
  };

  const getBorderColor = () => {
    if (status === 'saved') {
      return isDark ? '#ffffff1a' : '#00000030';
    }
    return 'transparent';
  };

  const getCheckColor = () => {
    if (status === 'success') {
      return isDark ? '#27272a' : '#ffffff';
    }
    return isDark ? '#a1a1aa' : '#27272a';
  };

  return (
    <MotionConfig
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
        mass: 1.05,
      }}
    >
      <motion.button
        type={type}
        disabled={disabled}
        aria-label={ariaLabel ?? (status === 'saved' ? savedText : idleText)}
        onClick={handleClick}
        initial={false}
        animate={{
          width: isCircle ? cfg.circleWidth : stableWidth,
          height: cfg.height,
          backgroundColor: getBackgroundColor(),
        }}
        style={{
          borderWidth: status === 'saved' ? '2px' : '0px',
          borderColor: getBorderColor(),
        }}
        transition={{
          type: 'spring',
          stiffness: 155,
          damping: 16,
          mass: 1.25,
          backgroundColor: {
            duration: 0.28,
          },
        }}
        className={cn(
          'relative z-0 inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#191918] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none shrink-0',
          className
        )}
      >
        <AnimatePresence mode="popLayout">
          {status === 'idle' && (
            <motion.span
              key="idle"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, transition: { duration: 0.15, ease: 'easeOut' } }}
              className={`absolute inset-0 flex items-center justify-center font-bold tracking-tight whitespace-nowrap px-3 ${cfg.text} text-[#2C2A26] dark:text-zinc-200`}
            >
              {idleText}
            </motion.span>
          )}

          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{
                opacity: 0,
                scale: 0.8,
                filter: 'blur(4px)',
                transition: { duration: 0.15, ease: 'easeOut' },
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <motion.svg
                viewBox="0 0 26 26"
                className={cfg.spinner}
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: 0.85,
                  ease: 'linear',
                }}
              >
                <circle
                  cx="13"
                  cy="13"
                  r="10"
                  stroke={isDark ? '#52525b' : '#D0CCC6'}
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M13 3 A10 10 0 0 1 23 13"
                  stroke={isDark ? '#a1a1aa' : 'white'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
              </motion.svg>
            </motion.div>
          )}

          {(status === 'success' || status === 'saved') && (
            <motion.div
              key="check-state"
              layout
              initial={
                status === 'success'
                  ? { opacity: 0, scale: 0.5, filter: 'blur(4px)' }
                  : { opacity: 1 }
              }
              animate={
                status === 'success'
                  ? { opacity: 1, scale: 1.15, filter: 'blur(0px)' }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              exit={{
                opacity: 0,
                y: 12,
                filter: 'blur(4px)',
                transition: { duration: 0.15, ease: 'easeOut' },
              }}
              className={`absolute inset-0 flex items-center justify-center ${
                status === 'saved' ? `${cfg.gap} ${cfg.padding}` : ''
              }`}
            >
              <motion.div
                layout
                animate={{
                  color: getCheckColor(),
                }}
              >
                <BsCheckCircleFill className={`${cfg.icon} z-20`} />
              </motion.div>

              <AnimatePresence mode="popLayout">
                {status === 'saved' && (
                  <motion.span
                    key="saved-label"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.1 }}
                    className={`font-bold tracking-tight whitespace-nowrap ${cfg.text} z-20 text-zinc-900 dark:text-zinc-300`}
                  >
                    {savedText}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </MotionConfig>
  );
};
