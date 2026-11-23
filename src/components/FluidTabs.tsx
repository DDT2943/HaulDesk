/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";

export type FluidTabItem<TId extends string = string> = {
  id: TId;
  label: string;
  icon?: ReactNode;
};

interface FluidTabsProps<TId extends string = string> {
  tabs: readonly FluidTabItem<TId>[];
  activeId: TId;
  onChange: (id: TId) => void;
  className?: string;
}

export function FluidTabs<TId extends string = string>({
  tabs,
  activeId,
  onChange,
  className = "",
}: FluidTabsProps<TId>) {
  return (
    <div
      className={`relative inline-flex items-center p-1 bg-[#EFEFEA] dark:bg-[#222220] border border-[#E5E5E0] dark:border-[#2C2C2A] rounded-2xl overflow-x-auto max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
      role="tablist"
      aria-label="Primary navigation"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative z-10 flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap select-none ${
              isActive
                ? "text-[#111110] dark:text-[#F4F4F0]"
                : "text-[#6E6E68] dark:text-[#9A9A92] hover:text-[#111110] dark:hover:text-[#F4F4F0]"
            }`}
          >
            {tab.icon && (
              <span className="shrink-0 transition-transform duration-200">
                {tab.icon}
              </span>
            )}
            <span className="truncate">{tab.label}</span>

            {isActive && (
              <motion.div
                layoutId="fluid-active-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-0 z-[-1] bg-white dark:bg-[#191918] shadow-sm rounded-xl border border-[#E5E5E0] dark:border-[#343430]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
