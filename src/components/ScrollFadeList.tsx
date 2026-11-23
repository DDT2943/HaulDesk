/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { type ReactNode, useEffect, useRef } from "react";

export type ScrollFadeListProps<TItem> = {
  getKey: (item: TItem) => string;
  items: readonly TItem[];
  renderItem: (item: TItem) => ReactNode;
  className?: string;
  maxFadeHeight?: number;
  scrollClassName?: string;
};

export function ScrollFadeList<TItem>({
  className = "relative overflow-hidden rounded-xl border bg-white dark:bg-[#1E1E1C] border-[#E5E5E0] dark:border-[#343430] [--scroll-fade-list-bg:white] dark:[--scroll-fade-list-bg:#1E1E1C] [--scrollbar-gutter-width:10px]",
  getKey,
  items,
  maxFadeHeight = 76,
  renderItem,
  scrollClassName = "h-64 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
}: ScrollFadeListProps<TItem>) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frameElement = frameRef.current;
    const scrollElement = scrollRef.current;
    let animationFrame = 0;

    if (!frameElement || !scrollElement) {
      return;
    }

    const updateFadeHeights = () => {
      const maxScrollTop = Math.max(
        0,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      const distanceFromTop = scrollElement.scrollTop;
      const distanceFromBottom = maxScrollTop - scrollElement.scrollTop;

      frameElement.style.setProperty(
        "--top-fade-height",
        `${Math.min(maxFadeHeight, Math.max(0, distanceFromTop))}px`,
      );
      frameElement.style.setProperty(
        "--bottom-fade-height",
        `${Math.min(maxFadeHeight, Math.max(0, distanceFromBottom))}px`,
      );
    };

    const scheduleFadeUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateFadeHeights);
    };

    updateFadeHeights();
    scrollElement.addEventListener("scroll", scheduleFadeUpdate, {
      passive: true,
    });

    const resizeObserver = new ResizeObserver(scheduleFadeUpdate);
    resizeObserver.observe(scrollElement);

    if (scrollElement.firstElementChild) {
      resizeObserver.observe(scrollElement.firstElementChild);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      scrollElement.removeEventListener("scroll", scheduleFadeUpdate);
      resizeObserver.disconnect();
    };
  }, [maxFadeHeight]);

  return (
    <div
      className={`${className} [--bottom-fade-height:0px] [--top-fade-height:0px] before:pointer-events-none before:absolute before:left-0 before:right-[var(--scrollbar-gutter-width)] before:top-0 before:h-[var(--top-fade-height)] before:bg-linear-to-b before:from-[var(--scroll-fade-list-bg)] before:to-transparent before:content-[''] after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-[var(--scrollbar-gutter-width)] after:h-[var(--bottom-fade-height)] after:bg-linear-to-b after:from-transparent after:to-[var(--scroll-fade-list-bg)] after:content-['']`}
      ref={frameRef}
    >
      <div className={scrollClassName} ref={scrollRef}>
        <ul className="p-1.5 space-y-1">
          {items.map((item) => (
            <li className="rounded-lg px-2.5 py-1.5 transition-colors" key={getKey(item)}>
              {renderItem(item)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
