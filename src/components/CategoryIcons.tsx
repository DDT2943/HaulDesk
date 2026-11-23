import { motion } from 'motion/react';
import type { ProductCategory } from '../types/haul';

interface CategoryIconProps {
  category: ProductCategory;
  className?: string;
  active?: boolean;
}

export function CategoryIcon({ category, className = 'w-5 h-5', active = false }: CategoryIconProps) {
  const strokeWidth = active ? 2 : 1.7;

  switch (category) {
    case 'Felpa':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M8.5 5.5C8.5 3.6 10 2.5 12 2.5C14 2.5 15.5 3.6 15.5 5.5" />
          <path d="M6.5 6.5L3 10.5L5.2 13L7 11.2V20.5H17V11.2L18.8 13L21 10.5L17.5 6.5L15.2 5.5H8.8L6.5 6.5Z" />
          <path d="M9.5 14.5H14.5V18H9.5V14.5Z" />
        </motion.svg>
      );

    case 'Maglietta':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M6.5 4.5L3 7.5L5.5 10.5L7.5 9V20H16.5V9L18.5 10.5L21 7.5L17.5 4.5H14.5C14.1 5.8 13.1 6.5 12 6.5C10.9 6.5 9.9 5.8 9.5 4.5H6.5Z" />
        </motion.svg>
      );

    case 'Maglietta da calcio':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M6.5 4.5L3 7.5L5.5 10.5L7.5 9V20H16.5V9L18.5 10.5L21 7.5L17.5 4.5H14.5L12 7L9.5 4.5H6.5Z" />
          <path d="M12 7V20" />
          <circle cx="14.2" cy="11.2" r="1.1" />
        </motion.svg>
      );

    case 'Pantaloni':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M6.5 3.5H17.5L19 20.5H14.2L12 10.5L9.8 20.5H5L6.5 3.5Z" />
          <path d="M6.3 7H17.7" />
          <path d="M5.7 12.5H8.5V15.5H5.5" />
          <path d="M18.3 12.5H15.5V15.5H18.5" />
        </motion.svg>
      );

    case 'Scarpe':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M3 16.5C3 17.6 3.9 18.5 5 18.5H19.5C20.6 18.5 21.5 17.6 21.5 16.5C21.5 15 20.3 14.2 18.5 13.8L14.5 12.5L11.5 7.5L8 8.5C7 9.8 5.5 10.5 4 10.5L3 16.5Z" />
          <path d="M3 16H21" />
        </motion.svg>
      );

    case 'Giubbini':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M9 3.5H15L17 5.5L21 9.5L18.5 12.5L17 11V20.5H7V11L5.5 12.5L3 9.5L7 5.5L9 3.5Z" />
          <path d="M12 5.5V20.5" />
          <path d="M7 10.5H17" />
          <path d="M7 15.5H17" />
        </motion.svg>
      );

    case 'Borse':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M5.5 9H18.5L19.5 20H4.5L5.5 9Z" />
          <path d="M8.5 9V6.5C8.5 4.6 10.1 3.5 12 3.5C13.9 3.5 15.5 4.6 15.5 6.5V9" />
          <path d="M9 13H15" />
        </motion.svg>
      );

    case 'Cappellini':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <path d="M4.5 14.5C4.5 9.8 7.8 6.5 12 6.5C16.2 6.5 19.5 9.8 19.5 14.5" />
          <path d="M3.5 14.5H20.5C21.5 14.5 22 15.8 20.8 16.5C18.5 17.5 15.2 17.5 12 17.5H5C4.1 17.5 3.5 16.2 3.5 14.5Z" />
          <path d="M12 5V6.5" />
        </motion.svg>
      );

    case 'Cinture':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <rect x="9.5" y="7.5" width="5" height="9" rx="1" />
          <path d="M2 9.5H9.5" />
          <path d="M2 14.5H9.5" />
          <path d="M14.5 9.5H22" />
          <path d="M14.5 14.5H22" />
          <path d="M11.5 12H13.5" />
          <circle cx="5.5" cy="12" r="0.7" />
        </motion.svg>
      );

    case 'Accessori':
      return (
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7" />
          <polyline points="12 9 12 12 14.5 13.5" />
          <path d="M12 2V5" />
          <path d="M12 19V22" />
        </motion.svg>
      );
  }
}
