import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, PackagePlus } from 'lucide-react';
import { DEFAULT_CNY_TO_EUR_RATE, validateOrderTitle } from '../utils/haulLogic';
import { TactileButton } from './TactileButtons';
import { SaveToggle } from './SaveToggle';

interface NewOrderModalProps {
  open: boolean;
  estimatedExchangeRate?: number;
  onClose: () => void;
  onCreateOrder: (payload: {
    title: string;
    agentNote: string;
    exchangeRate: number;
  }) => Promise<void>;
}

export function NewOrderModal({
  open,
  estimatedExchangeRate,
  onClose,
  onCreateOrder,
}: NewOrderModalProps) {
  const defaultRate = estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE;
  const [title, setTitle] = useState('');
  const [agentNote, setAgentNote] = useState('');
  const [exchangeRate, setExchangeRate] = useState(String(defaultRate));
  const [error, setError] = useState<string | null>(null);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const pendingPayloadRef = useRef<{
    title: string;
    agentNote: string;
    exchangeRate: number;
  } | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setExchangeRate(String(estimatedExchangeRate ?? DEFAULT_CNY_TO_EUR_RATE));
    } else {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setSaveTrigger(0);
      setError(null);
      pendingPayloadRef.current = null;
    }
  }, [open, estimatedExchangeRate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const titleErr = validateOrderTitle(title);
    if (titleErr) {
      setError(titleErr);
      return;
    }

    const parsedRate = Number(exchangeRate.replace(',', '.'));
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Enter a valid CNY -> EUR exchange rate (e.g. 0.13).');
      return;
    }

    setError(null);
    pendingPayloadRef.current = {
      title: title.trim(),
      agentNote: agentNote.trim(),
      exchangeRate: parsedRate,
    };
    setSaveTrigger((c) => c + 1);
  };

  const executeCreate = async (): Promise<boolean> => {
    const payload = pendingPayloadRef.current;
    if (!payload) return false;
    try {
      await onCreateOrder(payload);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating order');
      return false;
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111110]/40 dark:bg-black/70 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-order-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="w-full max-w-md bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl shadow-xl overflow-hidden"
      >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E0] dark:border-[#2C2C2A]">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#EFEFEA] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0]">
                  <PackagePlus className="w-4 h-4" />
                </span>
                <h2 id="new-order-title" className="text-base font-bold text-[#111110] dark:text-[#F4F4F0]">
                  Open New Order
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close new order modal"
                className="p-2 rounded-lg text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0] hover:bg-[#EFEFEA] dark:hover:bg-[#242422] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="order-title-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Order / Haul Name
                </label>
                <input
                  id="order-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Winter Haul #04"
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
              </div>

              <div>
                <label
                  htmlFor="order-note-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Warehouse / shipping note (optional)
                </label>
                <input
                  id="order-note-input"
                  type="text"
                  value={agentNote}
                  onChange={(e) => setAgentNote(e.target.value)}
                  placeholder="e.g. Superbuy Guangdong · Tax-Free Air"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] placeholder:text-[#8E8E87] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
              </div>

              <div>
                <label
                  htmlFor="order-rate-input"
                  className="block text-xs font-semibold text-[#111110] dark:text-[#F4F4F0] mb-1.5"
                >
                  Estimated rate (1 ¥ CNY in € EUR)
                </label>
                <input
                  id="order-rate-input"
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-[#F7F7F5] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] rounded-xl text-[#111110] dark:text-[#F4F4F0] focus:outline-none focus:bg-white dark:focus:bg-[#1E1E1C] focus:border-[#111110] dark:focus:border-[#F4F4F0]"
                />
              </div>

              {error && (
                <p className="text-xs text-[#DC2626] dark:text-[#F87171] bg-[#FEF2F2] dark:bg-[#3A161A] border border-[#FECACA] dark:border-[#7F1D1D] rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <TactileButton type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </TactileButton>
                <SaveToggle
                  type="submit"
                  size="xs"
                  idleText="Save Order"
                  savedText="Saved"
                  idleWidth={128}
                  savedWidth={112}
                  autoResetDelay={0}
                  triggerCount={saveTrigger}
                  onSave={executeCreate}
                  onStatusChange={(st) => {
                    if (st === 'saved') {
                      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
                      closeTimerRef.current = window.setTimeout(() => {
                        setTitle('');
                        setAgentNote('');
                        setExchangeRate(String(defaultRate));
                        onClose();
                      }, 480);
                    }
                  }}
                />
              </div>
            </form>
      </motion.div>
    </motion.div>
  );
}
