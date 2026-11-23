import { motion } from 'motion/react';
import { Sun, Moon } from 'lucide-react';

interface SwitchModeProps {
  width?: number;
  height?: number;
  darkColor?: string;
  lightColor?: string;
  knobDarkColor?: string;
  knobLightColor?: string;
  borderDarkColor?: string;
  borderLightColor?: string;
  isDark: boolean;
  onToggle: (isDark: boolean) => void;
  className?: string;
}

export const SwitchMode = ({
  width = 56,
  height = 28,
  darkColor = '#111110',
  lightColor = '#F9F9F9',
  knobDarkColor = '#1C1C1C',
  knobLightColor = '#F3F3F7',
  borderDarkColor = '#444444',
  borderLightColor = '#DDDDDD',
  isDark,
  onToggle,
  className = '',
}: SwitchModeProps) => {
  const knobSize = height * 0.8;
  const padding = (height - knobSize) / 2;
  const travelDistance = width - knobSize - padding * 2 - 2;
  const iconSize = Math.round(knobSize * 0.52);

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => onToggle(!isDark)}
      className={`relative rounded-full flex items-center cursor-pointer border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 ${className}`}
      style={{
        width,
        height,
        padding,
        backgroundColor: isDark ? darkColor : lightColor,
        borderColor: isDark ? borderDarkColor : borderLightColor,
      }}
      animate={{
        backgroundColor: isDark ? darkColor : lightColor,
        borderColor: isDark ? borderDarkColor : borderLightColor,
      }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="rounded-full shadow-md flex items-center justify-center relative"
        style={{
          width: knobSize,
          height: knobSize,
          backgroundColor: isDark ? knobDarkColor : knobLightColor,
        }}
        animate={{
          x: isDark ? travelDistance : 0,
          backgroundColor: isDark ? knobDarkColor : knobLightColor,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {/* Sun Icon */}
        <motion.div
          animate={{
            scale: isDark ? 0 : 1,
            opacity: isDark ? 0 : 1,
            rotate: isDark ? -90 : 0,
          }}
          transition={{ duration: 0.3 }}
          className="absolute"
        >
          <Sun size={iconSize} className="text-amber-500" />
        </motion.div>

        {/* Moon Icon */}
        <motion.div
          animate={{
            scale: isDark ? 1 : 0,
            opacity: isDark ? 1 : 0,
            rotate: isDark ? 0 : 90,
          }}
          transition={{ duration: 0.3 }}
          className="absolute"
        >
          <Moon size={iconSize} className="text-sky-300" />
        </motion.div>
      </motion.div>
    </motion.button>
  );
};
