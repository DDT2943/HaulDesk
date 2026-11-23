import { Undo2 } from 'lucide-react';
import { motion, useAnimate, MotionConfig } from 'motion/react';
import { useEffect, useState, useRef } from 'react';
import useMeasure from 'react-use-measure';

export type TimedUndoActionProps = {
  className?: string;
  compact?: boolean;
  undoDuration?: number;
  autoStart?: boolean;
  onUndoTrigger?: () => void;
  onCancel?: () => void;
  onExpire?: () => void;
  deleteText?: string;
  cancelText?: string;
};

export const TimedUndoAction = ({
  className = '',
  compact = false,
  undoDuration = 5,
  autoStart = false,
  onUndoTrigger,
  onCancel,
  onExpire,
  deleteText = 'Delete',
  cancelText = 'Cancel',
}: TimedUndoActionProps) => {
  const [undo, setUndo] = useState(autoStart);
  const [countDown, setCountDown] = useState(undoDuration);
  const [textRef, bounds] = useMeasure();
  const [counterScope, animateCounter] = useAnimate();
  const expiredFiredRef = useRef(false);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (autoStart) {
      expiredFiredRef.current = false;
      setCountDown(undoDuration);
      setUndo(true);
    }
  }, [autoStart, undoDuration]);

  useEffect(() => {
    if (!undo) return;

    const timer = window.setInterval(() => {
      setCountDown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          if (!expiredFiredRef.current) {
            expiredFiredRef.current = true;
            window.setTimeout(() => {
              setUndo(false);
              onExpireRef.current?.();
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [undo]);

  useEffect(() => {
    if (undo && counterScope.current) {
      void animateCounter(
        counterScope.current,
        { scale: [1.3, 1] },
        { duration: 0.25, ease: 'easeOut' }
      );
    }
  }, [countDown, undo, animateCounter, counterScope]);

  const handleToggle = () => {
    if (undo) {
      setUndo(false);
      setCountDown(undoDuration);
      onCancel?.();
    } else {
      expiredFiredRef.current = false;
      setCountDown(undoDuration);
      setUndo(true);
      onUndoTrigger?.();
    }
  };

  return (
    <MotionConfig transition={{ type: 'spring', stiffness: 450, damping: 25 }}>
      <div className="relative inline-flex items-center select-none">
        <motion.button
          type="button"
          onClick={handleToggle}
          animate={{
            width: bounds.width > 0 ? Math.ceil(bounds.width) + (compact ? 16 : 24) : 'auto',
            backgroundColor: undo
              ? 'rgba(225, 29, 72, 0.14)'
              : 'rgb(225, 29, 72)',
            color: undo ? 'rgb(225, 29, 72)' : 'rgb(255, 255, 255)',
          }}
          transition={{ duration: 0.24, type: 'spring', bounce: 0.15 }}
          aria-label={undo ? `${cancelText} (${countDown}s)` : deleteText}
          className={`flex items-center justify-center rounded-lg cursor-pointer overflow-hidden whitespace-nowrap font-medium border border-[#E11D48]/30 ${
            compact ? 'py-1 text-[11px] min-h-[28px]' : 'py-1.5 text-[11px] min-h-[32px]'
          } ${className}`}
        >
          <div
            ref={textRef}
            className={`flex items-center gap-1.5 w-max shrink-0 whitespace-nowrap ${
              compact ? 'px-1.5' : 'px-2.5'
            }`}
          >
            {undo ? (
              <div className="flex items-center gap-1">
                <Undo2 size={12} className="shrink-0" />
                <AnimatedText text={cancelText} />
                <motion.div
                  ref={counterScope}
                  className="bg-[#E11D48] rounded-full w-[16px] h-[16px] text-[9px] font-mono tabular-nums flex items-center justify-center text-white shrink-0"
                >
                  {countDown}
                </motion.div>
              </div>
            ) : (
              <AnimatedText text={deleteText} />
            )}
          </div>
        </motion.button>
      </div>
    </MotionConfig>
  );
};

const AnimatedText = ({ text }: { text: string }) => {
  return (
    <span className="inline-flex">
      {text.split('').map((char, idx) => (
        <motion.span
          key={`${text}-${idx}-${char}`}
          initial={{ y: 8, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 22,
            delay: idx * 0.025,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
};
