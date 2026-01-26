import { type Variants } from "framer-motion";

// Animation timing constants
export const ANIMATION_DURATION = {
  FAST: 0.6,
  NORMAL: 0.8,
  SLOW: 1,
} as const;

export const ANIMATION_DELAY = {
  PIECES: 0.4,
  DESCRIPTION: 0.8,
  BUTTON: 1.2,
  CONTINUOUS_START: 1.4,
} as const;

export const EASING = [0.22, 1, 0.36, 1] as const;

// Animation variants
export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

export const wordVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: ANIMATION_DURATION.NORMAL,
      ease: EASING,
    },
  },
};

export const descriptionVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION.FAST,
      delay: ANIMATION_DELAY.DESCRIPTION,
      ease: EASING,
    },
  },
};

export const buttonVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION.FAST,
      delay: ANIMATION_DELAY.BUTTON,
      ease: EASING,
    },
  },
};

// Continuous animation config for chess pieces
export const PIECES_ANIMATION_VALUES = {
  scale: [1, 1.05, 0.98, 1.05, 1],
  y: [0, -15, 5, -20, 0],
  rotate: [0, 2, -2, 3, -1, 0],
};

export const PIECES_TRANSITION = {
  opacity: {
    duration: ANIMATION_DURATION.SLOW,
    delay: ANIMATION_DELAY.PIECES,
    ease: EASING,
  },
  scale: {
    duration: 4,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay: ANIMATION_DELAY.CONTINUOUS_START,
  },
  y: {
    duration: 5,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay: ANIMATION_DELAY.CONTINUOUS_START,
  },
  rotate: {
    duration: 6,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay: ANIMATION_DELAY.CONTINUOUS_START,
  },
} as const;

