import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, X } from 'lucide-react';
import { FaFilter, FaLayerGroup, FaTshirt } from 'react-icons/fa';
import { GiMonclerJacket } from 'react-icons/gi';
import { IoFootball } from 'react-icons/io5';
import {
  PiBaseballCapFill,
  PiBeltFill,
  PiHandbagFill,
  PiHoodieFill,
  PiPantsFill,
  PiSneakerFill,
  PiWatchFill,
} from 'react-icons/pi';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../types/haul';

export type FilterIconComponent = ComponentType<{
  className?: string;
  size?: number | string;
}>;

export interface FilterDisclosureItem {
  id: string;
  label: string;
  icon: FilterIconComponent;
}

interface FilterDisclosureProps {
  items: FilterDisclosureItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  allId?: string;
  allLabel?: string;
  counts?: Record<string, number>;
  totalCount?: number;
  className?: string;
}

export const CATEGORY_FILTER_ITEMS: FilterDisclosureItem[] = PRODUCT_CATEGORIES.map((cat) => {
  const iconMap: Record<ProductCategory, FilterIconComponent> = {
    Felpa: PiHoodieFill,
    Giubbini: GiMonclerJacket,
    Maglietta: FaTshirt,
    'Maglietta da calcio': IoFootball,
    Pantaloni: PiPantsFill,
    Scarpe: PiSneakerFill,
    Borse: PiHandbagFill,
    Cappellini: PiBaseballCapFill,
    Cinture: PiBeltFill,
    Accessori: PiWatchFill,
  };

  return {
    id: cat.id,
    label: cat.label,
    icon: iconMap[cat.id],
  };
});

export function FilterDisclosure({
  items,
  activeId,
  onSelect,
  allId = 'All',
  allLabel = 'All categories',
  counts,
  totalCount,
  className = '',
}: FilterDisclosureProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>(allId);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentActiveId = activeId !== undefined ? activeId : internalActiveId;
  const activeItem = items.find((item) => item.id === currentActiveId) ?? null;
  const isFiltered = Boolean(activeItem && currentActiveId !== allId);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (nextId: string) => {
    if (activeId === undefined) {
      setInternalActiveId(nextId);
    }
    onSelect?.(nextId);
    setIsOpen(false);
  };

  const ActiveTriggerIcon = activeItem ? activeItem.icon : FaFilter;

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <div className="inline-flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={
            isFiltered && activeItem
              ? `Category filter: ${activeItem.label}`
              : 'Filter by category'
          }
          data-testid="category-filter-trigger"
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer select-none whitespace-nowrap ${
            isFiltered
              ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110] border-[#111110] dark:border-[#F4F4F0] shadow-xs'
              : 'bg-[#F7F7F5] dark:bg-[#242422] text-[#111110] dark:text-[#F4F4F0] border-[#E5E5E0] dark:border-[#343430] hover:bg-[#EFEFEA] dark:hover:bg-[#2C2C2A]'
          }`}
        >
          <ActiveTriggerIcon
            className={`w-3.5 h-3.5 shrink-0 ${
              isFiltered ? 'text-[#FB7185] dark:text-[#E11D48]' : 'text-[#6E6E68] dark:text-[#9A9A92]'
            }`}
          />
          <span className="max-w-[92px] sm:max-w-[150px] truncate">
            {isFiltered && activeItem ? activeItem.label : 'Filter'}
          </span>
          {isFiltered && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear category filter"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(allId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(allId);
                }
              }}
              className="ml-0.5 p-0.5 rounded-md hover:bg-white/20 dark:hover:bg-black/15 transition-colors"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            } ${isFiltered ? 'opacity-80' : 'text-[#6E6E68] dark:text-[#9A9A92]'}`}
          />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            role="listbox"
            aria-label="Select filter category"
            data-testid="category-filter-popover"
            className="absolute left-0 top-full mt-2 z-40 w-[264px] sm:w-[288px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#191918] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl shadow-xl p-1.5 origin-top-left"
          >
            <div className="max-h-[min(60vh,360px)] overflow-y-auto space-y-0.5 pr-0.5">
              <button
                type="button"
                role="option"
                aria-selected={!isFiltered}
                onClick={() => handleSelect(allId)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  !isFiltered
                    ? 'bg-[#111110] dark:bg-[#F4F4F0] text-white dark:text-[#111110]'
                    : 'text-[#111110] dark:text-[#F4F4F0] hover:bg-[#F7F7F5] dark:hover:bg-[#242422]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FaLayerGroup className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{allLabel}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {typeof totalCount === 'number' && (
                    <span className="text-[11px] font-mono tabular-nums opacity-70">
                      {totalCount}
                    </span>
                  )}
                  {!isFiltered && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>

              <div className="my-1 border-t border-[#EFEFEA] dark:border-[#262624]" />

              {items.map((item) => {
                const Icon = item.icon;
                const selected = currentActiveId === item.id;
                const itemCount = counts?.[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(selected ? allId : item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#FFF1F2] dark:bg-[#3A1620] text-[#E11D48] font-semibold'
                        : 'text-[#111110] dark:text-[#F4F4F0] hover:bg-[#F7F7F5] dark:hover:bg-[#242422]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          selected ? 'text-[#E11D48]' : 'text-[#52524E] dark:text-[#9A9A92]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {typeof itemCount === 'number' && (
                        <span className="text-[11px] font-mono tabular-nums opacity-70">
                          {itemCount}
                        </span>
                      )}
                      {selected && <Check className="w-3.5 h-3.5 text-[#E11D48]" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
