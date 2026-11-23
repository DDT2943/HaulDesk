import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { Check, Lock } from 'lucide-react';

interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export function TactileButton({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: TactileButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap shrink-0 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121211] disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizeStyles =
    size === 'sm' ? 'px-3 py-1.5 text-xs min-h-[36px]' : 'px-4 py-2 text-sm min-h-[40px]';

  const variantStyles = {
    primary:
      'bg-[#E11D48] text-white hover:bg-[#BE123C] shadow-[0_2px_0_0_rgba(136,19,55,0.45)] border border-[#BE123C]',
    dark:
      'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] hover:bg-[#272725] dark:hover:bg-[#E2E2DC] shadow-[0_2px_0_0_rgba(17,17,16,0.28)] border border-[#111110] dark:border-[#F4F4F0]',
    secondary:
      'bg-white dark:bg-[#222220] text-[#111110] dark:text-[#F4F4F0] hover:bg-[#F7F7F5] dark:hover:bg-[#2C2C2A] shadow-[0_1px_0_0_rgba(17,17,16,0.08)] border border-[#E5E5E0] dark:border-[#343430]',
    ghost:
      'bg-transparent text-[#52524E] dark:text-[#B4B4AC] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] border border-transparent',
    danger:
      'bg-white dark:bg-[#291719] text-[#DC2626] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1B1F] border border-[#FECACA] dark:border-[#7F1D1D] shadow-[0_1px_0_0_rgba(220,38,38,0.08)]',
  }[variant];

  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.98, y: 1 }}
      transition={{ duration: 0.12 }}
      disabled={disabled}
      className={`${base} ${sizeStyles} ${variantStyles} ${className}`}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  );
}

interface HoldToConcludeButtonProps {
  onConclude: () => Promise<void> | void;
  disabled?: boolean;
  orderTitle: string;
}

/**
 * Tactile hold-to-confirm button with continuous MotionValue animation:
 * interrupting mid-hold rewinds smoothly from the current progress, and
 * re-pressing mid-rewind resumes without jumping or snapping.
 */
export function HoldToConcludeButton({
  onConclude,
  disabled = false,
  orderTitle,
}: HoldToConcludeButtonProps) {
  const [holding, setHolding] = useState(false);
  const [armedClick, setArmedClick] = useState(false);
  const [busy, setBusy] = useState(false);

  const progressMV = useMotionValue(0);
  const animControlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const completedHoldRef = useRef(false);
  const armedTimeoutRef = useRef<number | null>(null);

  const HOLD_DURATION_S = 0.85;

  useEffect(() => {
    return () => {
      animControlsRef.current?.stop();
      if (armedTimeoutRef.current) window.clearTimeout(armedTimeoutRef.current);
    };
  }, []);

  const triggerConclude = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setArmedClick(false);
    setHolding(false);
    animControlsRef.current?.stop();
    progressMV.set(1);
    try {
      await onConclude();
    } finally {
      setBusy(false);
      progressMV.set(0);
    }
  };

  const startHold = () => {
    if (disabled || busy) return;
    completedHoldRef.current = false;
    setHolding(true);
    animControlsRef.current?.stop();

    const current = progressMV.get();
    const remainingDuration = Math.max(0.05, (1 - current) * HOLD_DURATION_S);

    animControlsRef.current = animate(progressMV, 1, {
      duration: remainingDuration,
      ease: 'linear',
      onComplete: () => {
        if (progressMV.get() >= 0.995) {
          completedHoldRef.current = true;
          setHolding(false);
          void triggerConclude();
        }
      },
    });
  };

  const cancelHold = () => {
    setHolding(false);
    if (completedHoldRef.current || busy) return;
    animControlsRef.current?.stop();

    const target = armedClick ? 0.35 : 0;
    const distance = Math.abs(progressMV.get() - target);
    animControlsRef.current = animate(progressMV, target, {
      duration: Math.max(0.14, distance * 0.42),
      ease: [0.22, 1, 0.36, 1],
    });
  };

  const handleClick = () => {
    if (disabled || busy) return;
    if (completedHoldRef.current) {
      completedHoldRef.current = false;
      return;
    }
    if (armedClick) {
      if (armedTimeoutRef.current) window.clearTimeout(armedTimeoutRef.current);
      void triggerConclude();
    } else {
      setArmedClick(true);
      animControlsRef.current?.stop();
      animControlsRef.current = animate(progressMV, 0.35, {
        type: 'spring',
        stiffness: 380,
        damping: 30,
      });
      if (armedTimeoutRef.current) window.clearTimeout(armedTimeoutRef.current);
      armedTimeoutRef.current = window.setTimeout(() => {
        setArmedClick(false);
        if (!holding) {
          animControlsRef.current?.stop();
          animControlsRef.current = animate(progressMV, 0, {
            duration: 0.28,
            ease: [0.22, 1, 0.36, 1],
          });
        }
      }, 4000);
    }
  };

  return (
    <div className="space-y-1.5">
      <motion.button
        type="button"
        disabled={disabled || busy}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onClick={handleClick}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        aria-label={`Conclude order ${orderTitle}`}
        className="relative w-full overflow-hidden rounded-xl border border-[#111110] dark:border-[#3A3A35] bg-[#111110] dark:bg-[#242422] px-4 py-2.5 text-sm font-medium text-white shadow-[0_2px_0_0_rgba(17,17,16,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#191918] disabled:opacity-50 cursor-pointer select-none"
      >
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 bg-[#E11D48] origin-left"
          style={{ scaleX: progressMV }}
        />
        <span className="relative z-10 flex items-center justify-center gap-2 whitespace-nowrap">
          {busy ? (
            <>
              <Check className="w-4 h-4" />
              Closing order...
            </>
          ) : armedClick ? (
            <>
              <Check className="w-4 h-4" />
              Click again to confirm
            </>
          ) : holding ? (
            <>
              <Lock className="w-4 h-4" />
              Keep holding...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Conclude Order
            </>
          )}
        </span>
      </motion.button>
      <p className="text-[11px] text-[#6E6E68] dark:text-[#9A9A92] text-center">
        Hold or double-click to manually close this order
      </p>
    </div>
  );
}
