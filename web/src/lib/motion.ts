import { spring, ease, transition, useShouldReduceMotion } from '@animate-ui/react/utils/motion'

export { spring, ease, transition, useShouldReduceMotion }

// Common motion variants for views and cards
export const viewMotionVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18, ease: ease.out },
}

export const cardMotionVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  transition: spring.pop,
}

export const modalOverlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: transition.overlay,
}

export const modalContentVariants = {
  initial: { opacity: 0, scale: 0.95, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 8 },
  transition: spring.dialog,
}
