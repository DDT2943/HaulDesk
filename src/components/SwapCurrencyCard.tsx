/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowUpDown, ChevronDown, Pencil } from 'lucide-react';
import { ScrollFadeList } from './ScrollFadeList';
import {
  DISPLAY_CURRENCIES,
  getCurrenciesWithEstimatedRate,
  isDisplayCurrencyCode,
  type CurrencyMeta,
  type DisplayCurrencyCode,
} from '../utils/haulLogic';

export type Currency = {
  code: DisplayCurrencyCode;
  symbol: string;
  rate: number;
  name: string;
  decimals: number;
};

export const DEMO_CURRENCIES: Currency[] = DISPLAY_CURRENCIES.map((c: CurrencyMeta) => ({
  code: c.code,
  symbol: c.symbol,
  rate: c.ratePerUsd,
  name: c.name,
  decimals: c.decimals,
}));

interface SwapCurrencyCardProps {
  currencies?: Currency[];
  estimatedExchangeRate?: number;
  onUpdateEstimatedExchangeRate?: (nextRate: number) => Promise<void> | void;
  defaultAmount?: string;
  defaultFromCode?: DisplayCurrencyCode;
  defaultToCode?: DisplayCurrencyCode;
  toCode?: DisplayCurrencyCode;
  onToCodeChange?: (code: DisplayCurrencyCode) => void;
  className?: string;
}

export function SwapCurrencyCard({
  currencies: explicitCurrencies,
  estimatedExchangeRate,
  onUpdateEstimatedExchangeRate,
  defaultAmount = '100',
  defaultFromCode = 'CNY',
  defaultToCode = 'EUR',
  toCode: controlledToCode,
  onToCodeChange,
  className = '',
}: SwapCurrencyCardProps) {
  const dynamicCurrencies = useMemo(() => {
    if (explicitCurrencies) return explicitCurrencies;
    const metaList = getCurrenciesWithEstimatedRate(estimatedExchangeRate ?? 0.13);
    return metaList.map((c) => ({
      code: c.code,
      symbol: c.symbol,
      rate: c.ratePerUsd,
      name: c.name,
      decimals: c.decimals,
    }));
  }, [explicitCurrencies, estimatedExchangeRate]);

  const currencies = dynamicCurrencies;

  const [fromCode, setFromCode] = useState<DisplayCurrencyCode>(
    defaultFromCode ?? currencies[0]?.code ?? 'CNY'
  );
  const [internalToCode, setInternalToCode] = useState<DisplayCurrencyCode>(
    defaultToCode ?? currencies[1]?.code ?? currencies[0]?.code ?? 'EUR'
  );
  const toCode = controlledToCode ?? internalToCode;

  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState<string>(
    String(estimatedExchangeRate ?? 0.13)
  );
  const [isSavingRate, setIsSavingRate] = useState(false);

  useEffect(() => {
    if (!isEditingRate && estimatedExchangeRate !== undefined) {
      setRateInput(String(estimatedExchangeRate));
    }
  }, [estimatedExchangeRate, isEditingRate]);

  const updateToCode = (next: DisplayCurrencyCode) => {
    setInternalToCode(next);
    onToCodeChange?.(next);
  };

  const [amountInput, setAmountInput] = useState<string>(defaultAmount);
  const [swapCount, setSwapCount] = useState<number>(0);

  const [openFromDropdown, setOpenFromDropdown] = useState(false);
  const [openToDropdown, setOpenToDropdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenFromDropdown(false);
        setOpenToDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fromCurrency =
    currencies.find((c) => c.code === fromCode) ?? currencies[0];
  const toCurrency =
    currencies.find((c) => c.code === toCode) ?? currencies[1] ?? currencies[0];

  const { convertedAmount, unitRate } = useMemo(() => {
    const raw = Number(amountInput.replace(',', '.'));
    const numeric = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    if (!fromCurrency || !toCurrency || fromCurrency.rate <= 0) {
      return { convertedAmount: 0, unitRate: 0 };
    }
    const ratio = toCurrency.rate / fromCurrency.rate;
    return {
      convertedAmount: numeric * ratio,
      unitRate: ratio,
    };
  }, [amountInput, fromCurrency, toCurrency]);

  const handleSwap = () => {
    const prevFrom = fromCurrency.code;
    const prevTo = toCurrency.code;
    setFromCode(prevTo);
    if (isDisplayCurrencyCode(prevFrom)) {
      updateToCode(prevFrom);
    }
    setSwapCount((c) => c + 1);
  };

  return (
    <section
      ref={containerRef}
      aria-label="Dynamic currency converter"
      className={`relative bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl p-4 space-y-3 ${className}`}
    >
      {/* Header aligned cleanly with sidebar cards */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#111110] dark:text-[#F4F4F0]">
          Currency Converter
        </h2>
        <span className="text-[11px] font-mono text-[#6E6E68] dark:text-[#9A9A92]">
          Site currency: {toCurrency.code}
        </span>
      </div>

      {/* Unified Currency Pair Panel */}
      <div className="rounded-xl bg-[#F7F7F5] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#343430]">
        {/* Source Currency Row */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={`Source currency ${fromCurrency.code}`}
                onClick={() => {
                  setOpenFromDropdown(!openFromDropdown);
                  setOpenToDropdown(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-xs font-bold text-[#111110] dark:text-[#F4F4F0] cursor-pointer hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] transition-colors"
              >
                <span className="font-mono text-[#E11D48] leading-none">{fromCurrency.symbol}</span>
                <span>{fromCurrency.code}</span>
                <ChevronDown className="w-3 h-3 opacity-65" />
              </button>

              {openFromDropdown && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-52 shadow-xl">
                  <ScrollFadeList
                    items={currencies}
                    getKey={(c) => c.code}
                    maxFadeHeight={40}
                    scrollClassName="max-h-52 overflow-y-auto overscroll-contain"
                    renderItem={(c) => (
                      <button
                        type="button"
                        onClick={() => {
                          setFromCode(c.code);
                          setOpenFromDropdown(false);
                        }}
                        className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                          c.code === fromCode
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] font-semibold'
                            : 'hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] text-[#111110] dark:text-[#F4F4F0]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="w-6 text-center font-mono font-bold text-[#E11D48] shrink-0">
                            {c.symbol}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="font-mono text-[11px] opacity-80">{c.code}</span>
                      </button>
                    )}
                  />
                </div>
              )}
            </div>

            <input
              type="text"
              inputMode="decimal"
              aria-label="Amount to convert"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full min-w-0 text-right font-mono text-base font-bold tabular-nums bg-transparent text-[#111110] dark:text-[#F4F4F0] focus:outline-none"
              placeholder="0"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
            <span className="truncate">{fromCurrency.name}</span>
            <span className="font-mono text-[10px] opacity-75">Amount</span>
          </div>
        </div>

        {/* Hairline Divider with Integrated Tactile Swap Control */}
        <div className="relative flex items-center justify-center border-t border-[#E5E5E0] dark:border-[#343430]">
          <motion.button
            type="button"
            onClick={handleSwap}
            whileTap={{ scale: 0.92 }}
            animate={{ rotate: swapCount * 180 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            aria-label="Swap currencies"
            className="absolute w-7 h-7 rounded-lg bg-white dark:bg-[#191918] text-[#111110] dark:text-[#F4F4F0] border border-[#E5E5E0] dark:border-[#343430] shadow-xs flex items-center justify-center cursor-pointer hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] transition-colors"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </motion.button>
        </div>

        {/* Target Currency Row (controls global site currency) */}
        <div className="p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={`Site target currency ${toCurrency.code}`}
                data-testid="swap-target-currency-btn"
                onClick={() => {
                  setOpenToDropdown(!openToDropdown);
                  setOpenFromDropdown(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#343430] text-xs font-bold text-[#111110] dark:text-[#F4F4F0] cursor-pointer hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] transition-colors"
              >
                <span className="font-mono text-[#E11D48] leading-none">{toCurrency.symbol}</span>
                <span>{toCurrency.code}</span>
                <ChevronDown className="w-3 h-3 opacity-65" />
              </button>

              {openToDropdown && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-52 shadow-xl">
                  <ScrollFadeList
                    items={currencies}
                    getKey={(c) => `to-${c.code}`}
                    maxFadeHeight={40}
                    scrollClassName="max-h-52 overflow-y-auto overscroll-contain"
                    renderItem={(c) => (
                      <button
                        type="button"
                        onClick={() => {
                          updateToCode(c.code);
                          setOpenToDropdown(false);
                        }}
                        className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                          c.code === toCode
                            ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] font-semibold'
                            : 'hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] text-[#111110] dark:text-[#F4F4F0]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="w-6 text-center font-mono font-bold text-[#E11D48] shrink-0">
                            {c.symbol}
                          </span>
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="font-mono text-[11px] opacity-80">{c.code}</span>
                      </button>
                    )}
                  />
                </div>
              )}
            </div>

            <motion.div
              key={`${convertedAmount.toFixed(2)}-${toCurrency.code}`}
              initial={{ opacity: 0.6, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              data-testid="swap-converted-amount"
              className="font-mono text-base font-bold tabular-nums text-[#E11D48] truncate text-right"
            >
              {convertedAmount.toLocaleString('en-US', {
                minimumFractionDigits: toCurrency.decimals,
                maximumFractionDigits: toCurrency.decimals,
              })}
            </motion.div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#6E6E68] dark:text-[#9A9A92]">
            <span className="truncate">{toCurrency.name}</span>
            <span className="font-mono text-[10px] opacity-75">Global</span>
          </div>
        </div>
      </div>

      {/* Clean Footer Rate Readout with Global Exchange Rate Quick Editing */}
      <div className="flex items-center justify-between text-[11px] text-[#6E6E68] dark:text-[#9A9A92] pt-0.5 px-0.5">
        <span title="Global estimated rate applied across the app">Site estimated rate</span>
        {isEditingRate && onUpdateEstimatedExchangeRate ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const num = Number(rateInput.replace(',', '.'));
              if (Number.isFinite(num) && num > 0 && num <= 50) {
                try {
                  setIsSavingRate(true);
                  await onUpdateEstimatedExchangeRate(num);
                  setIsEditingRate(false);
                } finally {
                  setIsSavingRate(false);
                }
              }
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-14 px-1 py-0.5 text-xs font-mono font-bold bg-white dark:bg-[#191918] border border-[#E11D48] rounded text-right text-[#111110] dark:text-[#F4F4F0]"
              autoFocus
            />
            <button
              type="submit"
              disabled={isSavingRate}
              className="px-1.5 py-0.5 text-[10px] font-bold bg-[#E11D48] text-white rounded hover:bg-[#BE123C] cursor-pointer"
            >
              {isSavingRate ? '...' : 'OK'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditingRate(false)}
              className="px-1 py-0.5 text-[10px] text-[#6E6E68] hover:text-[#111110] dark:hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums font-medium text-[#111110] dark:text-[#F4F4F0]">
              1 {fromCurrency.code} = {unitRate.toFixed(toCurrency.decimals === 0 ? 2 : 4)} {toCurrency.code}
            </span>
            {onUpdateEstimatedExchangeRate && (
              <button
                type="button"
                onClick={() => {
                  setRateInput(String(estimatedExchangeRate ?? 0.13));
                  setIsEditingRate(true);
                }}
                title="Edit global estimated exchange rate (applies across the site)"
                aria-label="Edit global estimated exchange rate"
                className="p-1 rounded text-[#6E6E68] hover:text-[#E11D48] hover:bg-[#EFEFEA] dark:hover:bg-[#2A2A27] transition-colors cursor-pointer"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
