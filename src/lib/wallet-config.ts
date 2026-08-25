// 1 Baylo point = ₱5 Philippine Peso — single source of truth for all point conversions.
// All item valuations, wallet top-ups, and offer points use this rate.
export const PHP_PER_POINT = 5;

export const phpToPoints = (php: number): number => Math.round(php / PHP_PER_POINT);
export const pointsToPhp = (points: number): number => points * PHP_PER_POINT;

// Platform fee rule — change here to enable revenue per top-up without touching any flow code.
// type "flat"       → fixed PHP charged per top-up  (e.g. value: 10  = ₱10 flat)
// type "percentage" → fraction of grossAmount        (e.g. value: 0.05 = 5%)
export const PLATFORM_FEE_CONFIG: { type: "flat" | "percentage"; value: number } = {
  type: "flat",
  value: 0, // ₱0 in demo mode — set a non-zero value to activate platform revenue
};

export function calcPlatformFee(grossAmount: number): number {
  if (PLATFORM_FEE_CONFIG.type === "flat") return PLATFORM_FEE_CONFIG.value;
  if (PLATFORM_FEE_CONFIG.type === "percentage") {
    return Math.round(grossAmount * PLATFORM_FEE_CONFIG.value * 100) / 100;
  }
  return 0;
}
