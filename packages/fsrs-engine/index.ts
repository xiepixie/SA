/**
 * FSRS Engine
 *
 * High-performance FSRS v5 implementation using Rust FFI.
 *
 * @example
 * ```typescript
 * import fsrs, { Rating, State } from '@v2/fsrs-engine'
 *
 * // Create a new card
 * let card = fsrs.createCard()
 *
 * // Process a review
 * card = fsrs.processReview(card, Rating.Good)
 *
 * // Preview all ratings
 * const preview = fsrs.previewRatings(card)
 * console.log(`Good: ${preview.good.interval} days`)
 * ```
 */

export {
  // Core functions
  nextStates,
  review,
  migrateFromSm2,
  retrievability,
  nextInterval,
  version,
  defaultParameters,

  // High-level API
  createCard,
  processReview,
  previewRatings,

  // Enums
  Rating,
  State,
  ErrorType,

  // Error class
  FSRSError,

  // Types
  type MemoryState,
  type CardState,
  type AllNextStates,
  type ReviewResult,
  type ErrorResponse,
  type Card,
} from "./ffi";

export { default } from "./ffi";
