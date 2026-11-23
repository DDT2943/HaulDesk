import { CheckCircle2, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useContext,
} from 'react';

export type ReceiptPrinterStage = 'processing' | 'printing' | 'complete';
export type ReceiptFeedMotion = 'smooth' | 'stepped';

export type ReceiptPrinterRootProps = Omit<
  ComponentPropsWithoutRef<'section'>,
  'children'
> & {
  animate?: boolean;
  children: ReactNode;
  feedMotion?: ReceiptFeedMotion;
  stage: ReceiptPrinterStage;
};

export type ReceiptPrinterMachineProps = ComponentPropsWithoutRef<'div'>;
export type ReceiptPrinterHeaderProps = ComponentPropsWithoutRef<'div'>;
export type ReceiptPrinterScreenProps = ComponentPropsWithoutRef<'div'>;
export type ReceiptPrinterOutputProps = ComponentPropsWithoutRef<'div'>;
export type ReceiptPrinterPaperProps = ComponentPropsWithoutRef<'article'>;

export type ReceiptPrinterStatusProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> & {
  children?: ReactNode;
};

type ReceiptPrinterContextValue = {
  animate: boolean;
  feedMotion: ReceiptFeedMotion;
  shouldMove: boolean;
  stage: ReceiptPrinterStage;
};

const ReceiptPrinterContext = createContext<ReceiptPrinterContextValue | null>(
  null
);

const easeOut = [0.23, 1, 0.32, 1] as const;
const easeInOut = [0.77, 0, 0.175, 1] as const;

const receiptToothCount = 40;
const receiptToothDepth = 4;
const receiptToothPoints = Array.from(
  { length: receiptToothCount * 2 },
  (_, index) => {
    const x = 100 - ((index + 1) * 100) / (receiptToothCount * 2);
    const y = index % 2 === 0 ? '100%' : `calc(100% - ${receiptToothDepth}px)`;
    return `${x}% ${y}`;
  }
).join(', ');
const receiptClipPath = `polygon(0 0, 100% 0, 100% calc(100% - ${receiptToothDepth}px), ${receiptToothPoints})`;

const printingTransformKeyframes = [
  'translateY(calc(-100% + 2px))',
  'translateY(-91%)',
  'translateY(-91%)',
  'translateY(-81%)',
  'translateY(-81%)',
  'translateY(-70%)',
  'translateY(-70%)',
  'translateY(-58%)',
  'translateY(-58%)',
  'translateY(-45%)',
  'translateY(-45%)',
  'translateY(-32%)',
  'translateY(-32%)',
  'translateY(-20%)',
  'translateY(-20%)',
  'translateY(-10%)',
  'translateY(-10%)',
  'translateY(-3%)',
  'translateY(-3%)',
  'translateY(0%)',
];

const printingKeyframeTimes = [
  0, 0.075, 0.105, 0.18, 0.21, 0.285, 0.315, 0.39, 0.42, 0.495, 0.525, 0.6,
  0.63, 0.705, 0.735, 0.81, 0.84, 0.915, 0.945, 1,
];

const statusLabels: Record<ReceiptPrinterStage, string> = {
  processing: 'Processing order',
  printing: 'Printing receipt',
  complete: 'Order concluded',
};

const machineClassName =
  'printer-noise-bg relative isolate w-full overflow-hidden rounded-[var(--printer-radius)] border border-grayscale-12 bg-[color-mix(in_oklab,var(--color-grayscale-11)_30%,var(--color-grayscale-12))] p-[var(--printer-inset)] pb-8 shadow-[0_20px_36px_-20px_color-mix(in_oklab,var(--color-grayscale-12)_55%,transparent),0_6px_14px_-8px_color-mix(in_oklab,var(--color-grayscale-12)_24%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-grayscale-1)_14%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--color-grayscale-12)_55%,transparent)] [--printer-inner-radius:calc(var(--printer-radius)_-_var(--printer-inset))] [--printer-inset:0.75rem] [--printer-radius:1.5rem] dark:border-grayscale-3 dark:bg-grayscale-4 dark:shadow-[0_20px_36px_-20px_color-mix(in_oklab,var(--color-grayscale-3)_55%,transparent),0_6px_14px_-8px_color-mix(in_oklab,var(--color-grayscale-3)_24%,transparent),inset_0_1px_0_color-mix(in_oklab,var(--color-grayscale-12)_14%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--color-grayscale-3)_55%,transparent)]';

function useReceiptPrinter(component: string) {
  const context = useContext(ReceiptPrinterContext);
  if (!context) {
    throw new Error(`${component} must be used inside ReceiptPrinter.Root.`);
  }
  return context;
}

function ReceiptPrinterRoot({
  'aria-label': ariaLabel = 'Order receipt printer',
  animate = true,
  children,
  className = '',
  feedMotion = 'stepped',
  stage,
  ...props
}: ReceiptPrinterRootProps) {
  const shouldReduceMotion = useReducedMotion();
  const context = {
    animate,
    feedMotion,
    shouldMove: animate && !shouldReduceMotion,
    stage,
  };

  return (
    <ReceiptPrinterContext.Provider value={context}>
      <section
        aria-label={ariaLabel}
        data-stage={stage}
        className={`relative isolate flex w-full max-w-sm flex-col items-center ${className}`}
        {...props}
      >
        {children}
      </section>
    </ReceiptPrinterContext.Provider>
  );
}

function ReceiptPrinterMachine({
  children,
  className = '',
  ...props
}: ReceiptPrinterMachineProps) {
  return (
    <div className={`${machineClassName} ${className}`} {...props}>
      {children}
    </div>
  );
}

function ReceiptPrinterHeader({
  children,
  className = '',
  ...props
}: ReceiptPrinterHeaderProps) {
  return (
    <div
      className={`relative z-10 overflow-hidden rounded-[var(--printer-inner-radius)] border border-grayscale-12/80 bg-grayscale-12/70 shadow-[inset_0_1px_2px_color-mix(in_oklab,var(--color-grayscale-12)_75%,transparent)] dark:border-grayscale-2/80 dark:bg-grayscale-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function ReceiptPrinterScreen({
  children,
  className = '',
  ...props
}: ReceiptPrinterScreenProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[calc(var(--printer-inner-radius)_-_1px)] px-4 py-3.5 text-center font-mono text-xs font-medium tracking-wider uppercase text-grayscale-1 shadow-[inset_0_2px_6px_color-mix(in_oklab,var(--color-grayscale-12)_75%,transparent)] ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, color-mix(in oklab, var(--color-grayscale-12) 10%, transparent) 0px, color-mix(in oklab, var(--color-grayscale-12) 10%, transparent) 1px, transparent 1px, transparent 3px), radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--color-grayscale-1) 9%, transparent), transparent 65%), linear-gradient(180deg, color-mix(in oklab, var(--color-grayscale-11) 92%, var(--color-grayscale-12)) 0%, var(--color-grayscale-12) 100%)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function ReceiptPrinterStatus({
  children,
  className = '',
  ...props
}: ReceiptPrinterStatusProps) {
  const { shouldMove, stage } = useReceiptPrinter('ReceiptPrinter.Status');
  const label = children ?? statusLabels[stage];
  const isComplete = stage === 'complete';

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`relative z-10 flex min-h-4 items-center justify-center ${className}`}
      {...props}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5"
          exit={shouldMove ? { opacity: 0, y: -4 } : { opacity: 0 }}
          initial={shouldMove ? { opacity: 0, y: 4 } : { opacity: 0 }}
          key={stage}
          transition={{ duration: shouldMove ? 0.22 : 0, ease: easeOut }}
        >
          {isComplete ? (
            <CheckCircle2
              aria-hidden="true"
              className="size-3.5 shrink-0 text-green-9"
            />
          ) : (
            <Loader2
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-grayscale-5"
            />
          )}
          <span className="truncate">{label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ReceiptPrinterOutput({
  children,
  className = '',
  ...props
}: ReceiptPrinterOutputProps) {
  const { feedMotion, shouldMove, stage } = useReceiptPrinter(
    'ReceiptPrinter.Output'
  );
  const showReceipt = stage === 'printing' || stage === 'complete';
  const paperPadding = 'calc(var(--printer-inset) + 1rem)';

  const paperStyle = {
    backgroundImage:
      'radial-gradient(circle at 20% 15%, rgba(17,17,16,0.025) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(17,17,16,0.02) 0%, transparent 40%)',
    clipPath: receiptClipPath,
    WebkitClipPath: receiptClipPath,
  };

  return (
    <div className="relative z-10 flex w-full flex-col items-center">
      {/* Printer paper slot lip */}
      <div className="relative mx-auto mt-5 h-3.5 w-[92%] rounded-full border border-grayscale-12 bg-grayscale-12 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.12)] dark:border-grayscale-1 dark:bg-grayscale-1" />

      {/* Feed container extending slightly down from the slot */}
      <div
        className={`relative -mt-2 w-full overflow-hidden px-4 pb-6 pt-1 ${className}`}
        {...props}
      >
        <AnimatePresence initial={false}>
          {showReceipt && (
            <motion.div
              key="receipt-sheet"
              style={{
                paddingLeft: paperPadding,
                paddingRight: paperPadding,
                marginLeft: `calc(-1 * ${paperPadding})`,
                marginRight: `calc(-1 * ${paperPadding})`,
              }}
              initial={
                shouldMove
                  ? { transform: 'translateY(calc(-100% + 2px))' }
                  : { transform: 'translateY(0%)' }
              }
              animate={
                !shouldMove
                  ? { transform: 'translateY(0%)' }
                  : stage === 'printing' && feedMotion === 'stepped'
                    ? { transform: printingTransformKeyframes }
                    : { transform: 'translateY(0%)' }
              }
              exit={
                shouldMove
                  ? { transform: 'translateY(calc(-100% + 2px))' }
                  : { opacity: 0 }
              }
              transition={
                !shouldMove
                  ? { duration: 0 }
                  : stage === 'printing' && feedMotion === 'stepped'
                    ? {
                        duration: 1.85,
                        ease: easeOut,
                        times: printingKeyframeTimes,
                      }
                    : stage === 'printing'
                      ? {
                          duration: 1.35,
                          ease: easeInOut,
                        }
                      : { duration: 0.15 }
              }
              className="relative shadow-[0_14px_24px_rgba(0,0,0,0.22)]"
            >
              <div
                style={paperStyle}
                className="relative w-full bg-white text-[#111110] px-5 pt-4 pb-7 border-x border-t border-[#E5E5E0]"
              >
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ReceiptPrinterPaper({
  children,
  className = '',
  ...props
}: ReceiptPrinterPaperProps) {
  return (
    <article
      className={`font-mono text-xs text-[#111110] space-y-3 ${className}`}
      {...props}
    >
      {children}
    </article>
  );
}

export const ReceiptPrinter = {
  Root: ReceiptPrinterRoot,
  Machine: ReceiptPrinterMachine,
  Header: ReceiptPrinterHeader,
  Screen: ReceiptPrinterScreen,
  Status: ReceiptPrinterStatus,
  Output: ReceiptPrinterOutput,
  Paper: ReceiptPrinterPaper,
};
