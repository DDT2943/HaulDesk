import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ProductCategory } from '../types/haul';
import { getItemImages } from '../utils/haulLogic';
import { CategoryIcon } from './CategoryIcons';

interface ProductThumbProps {
  imageUrl: string;
  imageUrls?: string[];
  title: string;
  category: ProductCategory;
  size?: 'sm' | 'md' | 'lg';
}

export function ProductThumb({
  imageUrl,
  imageUrls,
  title,
  category,
  size = 'md',
}: ProductThumbProps) {
  const [failed, setFailed] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const images = getItemImages({ imageUrl, imageUrls }).filter(Boolean);

  const safeIdx = images.length > 0 ? activeIdx % images.length : 0;
  const resolved = images[safeIdx] ?? '';

  const dims =
    size === 'sm'
      ? 'w-12 h-12 rounded-lg'
      : size === 'lg'
        ? 'w-20 h-20 rounded-xl'
        : 'w-16 h-16 rounded-xl';

  if (!resolved || failed) {
    return (
      <div
        className={`${dims} bg-[#EFEFEA] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] flex flex-col items-center justify-center text-[#6E6E68] dark:text-[#9A9A92] shrink-0`}
        aria-label={`Preview unavailable for ${title}`}
      >
        <CategoryIcon category={category} className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div
      className={`relative ${dims} bg-[#EFEFEA] dark:bg-[#242422] border border-[#E5E5E0] dark:border-[#343430] overflow-hidden shrink-0`}
    >
      <img
        src={resolved}
        alt={`${title}${images.length > 1 ? ` (photo ${safeIdx + 1} of ${images.length})` : ''}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFailed(false);
            setActiveIdx((prev) => (prev + 1) % images.length);
          }}
          aria-label={`Switch photo for ${title} (${safeIdx + 1} of ${images.length})`}
          className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-[#111110]/80 text-white text-[9px] font-mono tabular-nums inline-flex items-center gap-0.5 cursor-pointer hover:bg-[#E11D48] transition-colors"
        >
          {safeIdx + 1}/{images.length}
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
