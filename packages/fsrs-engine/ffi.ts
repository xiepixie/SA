/**
 * FSRS Engine - Bun FFI Wrapper
 *
 * Provides TypeScript bindings for the Rust FSRS engine.
 * Uses Bun's FFI to call native Rust functions for high-performance
 * spaced repetition calculations.
 */

import { dlopen, FFIType, ptr, suffix, toArrayBuffer, type Pointer } from "bun:ffi";
import { join } from "node:path";
import { existsSync } from "node:fs";

// ============================================================
// Types
// ============================================================

/** Memory state representing card's learning progress */
export interface MemoryState {
  stability: number;
  difficulty: number;
}

/** Card state after a review with a specific rating */
export interface CardState {
  stability: number;
  difficulty: number;
  interval: number;
}

/** All possible next states for each rating */
export interface AllNextStates {
  again: CardState;
  hard: CardState;
  good: CardState;
  easy: CardState;
}

/** Complete review result */
export interface ReviewResult {
  /** The selected state based on rating */
  selected: CardState;
  /** All possible states for preview */
  all_states: AllNextStates;
  /** Current retrievability (0-1) */
  retrievability: number;
}

/** Error type classification */
export const ErrorType = {
  InvalidParameter: "invalid_parameter",
  ParseError: "parse_error",
  CalculationError: "calculation_error",
  SerializationError: "serialization_error",
  InitializationError: "initialization_error",
} as const;
export type ErrorType = (typeof ErrorType)[keyof typeof ErrorType];


/** Enhanced error response with error type and context */
export interface ErrorResponse {
  error_type: ErrorType;
  error: string;
  code: number;
  context?: Record<string, string>;
}

/** Rating values */
export const Rating = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;
export type Rating = (typeof Rating)[keyof typeof Rating];


/** Card state values */
export const State = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;
export type State = (typeof State)[keyof typeof State];


// ============================================================
// FFI Setup
// ============================================================

// Define the FFI function signatures
const ffiDefinition = {
  fsrs_next_states: {
    args: [FFIType.ptr, FFIType.f64, FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  fsrs_review: {
    args: [FFIType.ptr, FFIType.i32, FFIType.f64, FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  fsrs_migrate_sm2: {
    args: [FFIType.f64, FFIType.f64, FFIType.f64, FFIType.ptr] as const,
    returns: FFIType.ptr,
  },
  fsrs_retrievability: {
    args: [FFIType.f64, FFIType.f64, FFIType.u32] as const,
    returns: FFIType.f64,
  },
  fsrs_next_interval: {
    args: [FFIType.f64, FFIType.f64, FFIType.u32, FFIType.ptr] as const,
    returns: FFIType.f64,
  },
  fsrs_free_string: {
    args: [FFIType.ptr] as const,
    returns: FFIType.void,
  },
  fsrs_version: {
    args: [] as const,
    returns: FFIType.ptr,
  },
  fsrs_default_parameters: {
    args: [] as const,
    returns: FFIType.ptr,
  },
} as const;

// Determine library path based on platform and build mode
function getLibPath(): string {
  const libName =
    process.platform === "win32" ? "fsrs_engine.dll" : `libfsrs_engine.${suffix}`;

  const searchPaths = [
    join(import.meta.dir, "target", "release", libName),
    join(import.meta.dir, "target", "debug", libName),
  ];

  // If FSRS_DEBUG is set, prioritize debug build
  if (process.env.FSRS_DEBUG === "1") {
    searchPaths.reverse();
  }

  for (const path of searchPaths) {
    try {
      if (existsSync(path)) {
        return path;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Fallback to the default path based on NODE_ENV for error reporting
  const isDebug = process.env.FSRS_DEBUG === "1" || process.env.NODE_ENV === "development";
  const buildDir = isDebug ? "debug" : "release";
  return join(import.meta.dir, "target", buildDir, libName);
}

const libPath = getLibPath();

let lib: ReturnType<typeof dlopen<typeof ffiDefinition>> | null = null;

function getLib() {
  if (!lib) {
    try {
      lib = dlopen(libPath, ffiDefinition);
    } catch (e) {
      throw new Error(
        `Failed to load FSRS engine library from ${libPath}. ` +
        `Please ensure you have built the native library using 'npm run build:fsrs'. ` +
        `System Error: ${e}`
      );
    }
  }
  return lib;
}

// ============================================================
// Helper Functions
// ============================================================

/** Convert string to null-terminated buffer for FFI */
function toCString(str: string | null | undefined): Uint8Array {
  if (!str) {
    return new Uint8Array([0]);
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const buffer = new Uint8Array(bytes.length + 1);
  buffer.set(bytes);
  buffer[bytes.length] = 0;
  return buffer;
}

/** Read C string from pointer and free it */
function readAndFreeString(pointer: Pointer | null): string {
  if (!pointer) {
    return "";
  }

  const { symbols } = getLib();

  // Optimized string reading for Bun
  // We read in chunks to handle arbitrary lengths without pre-calculating everything
  let result = "";
  const CHUNK_SIZE = 1024;
  let offset = 0;
  let foundNull = false;

  while (!foundNull) {
    const buffer = toArrayBuffer(pointer, offset, CHUNK_SIZE);
    const view = new Uint8Array(buffer);

    let nullIndex = -1;
    for (let i = 0; i < view.length; i++) {
      if (view[i] === 0) {
        nullIndex = i;
        foundNull = true;
        break;
      }
    }

    const lengthToRead = foundNull ? nullIndex : CHUNK_SIZE;
    if (lengthToRead > 0) {
      result += new TextDecoder().decode(view.subarray(0, lengthToRead));
    }

    offset += CHUNK_SIZE;

    // Safety break for extremely large strings (1MB should be plenty for FSRS JSON)
    if (offset > 1024 * 1024) {
      console.warn("⚠️ [FSRS] String reading exceeded 1MB, truncating.");
      break;
    }
  }

  // Free the string allocated by Rust
  symbols.fsrs_free_string(pointer);

  return result;
}

/** Parse JSON result, throwing on error with enhanced error information */
function parseResult<T>(json: string): T {
  const parsed = JSON.parse(json);
  if (parsed.error || parsed.error_type) {
    const error = parsed as ErrorResponse;
    throw new FSRSError(
      error.error || "Unknown error",
      error.error_type || ErrorType.CalculationError,
      error.code || 0,
      error.context
    );
  }
  return parsed as T;
}

/** Enhanced FSRS error class */
export class FSRSError extends Error {
  public readonly errorType: ErrorType;
  public readonly code: number;
  public readonly context?: Record<string, string>;

  constructor(
    message: string,
    errorType: ErrorType,
    code: number,
    context?: Record<string, string>
  ) {
    super(message);
    this.errorType = errorType;
    this.code = code;
    this.context = context;
    this.name = "FSRSError";
  }


  /** Check if error is a specific type */
  isType(type: ErrorType): boolean {
    return this.errorType === type;
  }

  /** Get user-friendly error message */
  getUserMessage(): string {
    switch (this.errorType) {
      case ErrorType.InvalidParameter:
        return `Invalid parameter: ${this.message}`;
      case ErrorType.ParseError:
        return `Failed to parse input: ${this.message}`;
      case ErrorType.CalculationError:
        return `Calculation failed: ${this.message}`;
      case ErrorType.SerializationError:
        return `Serialization failed: ${this.message}`;
      case ErrorType.InitializationError:
        return `Initialization failed: ${this.message}`;
      default:
        return this.message;
    }
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Calculate next states for all ratings
 *
 * @param memory - Current memory state (null for new card)
 * @param desiredRetention - Target retention rate (0.7-0.99, typically 0.9)
 * @param daysElapsed - Days since last review (0 for new card)
 * @param weights - FSRS parameters (21 values), null for defaults
 * @returns All possible next states
 */
export function nextStates(
  memory: MemoryState | null,
  desiredRetention: number = 0.9,
  daysElapsed: number = 0,
  weights: number[] | null = null
): AllNextStates {
  const { symbols } = getLib();

  const memoryJson = toCString(memory ? JSON.stringify(memory) : null);
  const weightsJson = toCString(weights ? JSON.stringify(weights) : null);

  const resultPtr = symbols.fsrs_next_states(
    ptr(memoryJson),
    desiredRetention,
    daysElapsed,
    ptr(weightsJson)
  );

  const json = readAndFreeString(resultPtr);
  return parseResult<AllNextStates>(json);
}

/**
 * Calculate review result for a specific rating
 *
 * @param memory - Current memory state (null for new card)
 * @param rating - User rating (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @param desiredRetention - Target retention rate (0.7-0.99)
 * @param daysElapsed - Days since last review
 * @param weights - FSRS parameters (21 values), null for defaults
 * @returns Review result with selected state and all states
 */
export function review(
  memory: MemoryState | null,
  rating: Rating | number,
  desiredRetention: number = 0.9,
  daysElapsed: number = 0,
  weights: number[] | null = null
): ReviewResult {
  const { symbols } = getLib();

  const memoryJson = toCString(memory ? JSON.stringify(memory) : null);
  const weightsJson = toCString(weights ? JSON.stringify(weights) : null);

  const resultPtr = symbols.fsrs_review(
    ptr(memoryJson),
    rating,
    desiredRetention,
    daysElapsed,
    ptr(weightsJson)
  );

  const json = readAndFreeString(resultPtr);
  return parseResult<ReviewResult>(json);
}

/**
 * Migrate from SM-2 to FSRS memory state
 *
 * @param easeFactor - SM-2 ease factor (typically 2.5)
 * @param interval - Current interval in days
 * @param sm2Retention - Estimated retention rate (typically 0.9)
 * @param weights - FSRS parameters (21 values), null for defaults
 * @returns FSRS memory state
 */
export function migrateFromSm2(
  easeFactor: number,
  interval: number,
  sm2Retention: number = 0.9,
  weights: number[] | null = null
): MemoryState {
  const { symbols } = getLib();

  const weightsJson = toCString(weights ? JSON.stringify(weights) : null);

  const resultPtr = symbols.fsrs_migrate_sm2(
    easeFactor,
    interval,
    sm2Retention,
    ptr(weightsJson)
  );

  const json = readAndFreeString(resultPtr);
  return parseResult<MemoryState>(json);
}

/**
 * Calculate current retrievability
 *
 * @param stability - Memory stability
 * @param difficulty - Memory difficulty
 * @param daysElapsed - Days since last review
 * @returns Retrievability (0-1)
 */
export function retrievability(
  stability: number,
  difficulty: number,
  daysElapsed: number
): number {
  const { symbols } = getLib();
  return symbols.fsrs_retrievability(
    stability,
    difficulty,
    daysElapsed
  ) as number;
}

/**
 * Calculate next interval for a given stability and rating
 *
 * @param stability - Current stability (0 or negative for new card)
 * @param desiredRetention - Target retention rate
 * @param rating - User rating (1-4)
 * @param weights - FSRS parameters (21 values), null for defaults
 * @returns Next interval in days
 */
export function nextInterval(
  stability: number,
  desiredRetention: number,
  rating: Rating | number,
  weights: number[] | null = null
): number {
  const { symbols } = getLib();

  const weightsJson = toCString(weights ? JSON.stringify(weights) : null);

  return symbols.fsrs_next_interval(
    stability,
    desiredRetention,
    rating,
    ptr(weightsJson)
  ) as number;
}

/**
 * Get library version
 */
export function version(): string {
  const { symbols } = getLib();
  const resultPtr = symbols.fsrs_version();
  return readAndFreeString(resultPtr);
}

/**
 * Get default FSRS parameters
 */
export function defaultParameters(): number[] {
  const { symbols } = getLib();
  const resultPtr = symbols.fsrs_default_parameters();
  const json = readAndFreeString(resultPtr);
  return JSON.parse(json);
}

// ============================================================
// High-Level API (Convenience Functions)
// ============================================================

/**
 * Card representation for high-level API
 */
export interface Card {
  state: State;
  stability: number;
  difficulty: number;
  due: Date;
  lastReview: Date | null;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
}

/**
 * Create a new card with default values
 */
export function createCard(): Card {
  return {
    state: State.New,
    stability: 0,
    difficulty: 0,
    due: new Date(),
    lastReview: null,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
  };
}

/**
 * Process a review and return updated card
 *
 * @param card - Current card state
 * @param rating - User rating
 * @param desiredRetention - Target retention rate
 * @param weights - FSRS parameters
 * @returns Updated card
 */
export function processReview(
  card: Card,
  rating: Rating | number,
  desiredRetention: number = 0.9,
  weights: number[] | null = null
): Card {
  const now = new Date();

  // Calculate elapsed days
  const lastReview = card.lastReview || card.due;
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Get memory state (null for new cards)
  const memory: MemoryState | null =
    card.state === State.New
      ? null
      : {
        stability: card.stability,
        difficulty: card.difficulty,
      };

  // Calculate review result
  const result = review(memory, rating, desiredRetention, elapsedDays, weights);

  // Determine new state
  let newState: State;
  if (rating === Rating.Again) {
    newState =
      card.state === State.New ? State.Learning : State.Relearning;
  } else if (card.state === State.New || card.state === State.Learning) {
    newState = result.selected.interval >= 1 ? State.Review : State.Learning;
  } else {
    newState = State.Review;
  }

  // Calculate due date
  const dueDate = new Date(
    now.getTime() + result.selected.interval * 24 * 60 * 60 * 1000
  );

  return {
    state: newState,
    stability: result.selected.stability,
    difficulty: result.selected.difficulty,
    due: dueDate,
    lastReview: now,
    reps: card.reps + 1,
    lapses: rating === Rating.Again ? card.lapses + 1 : card.lapses,
    elapsedDays,
    scheduledDays: Math.round(result.selected.interval),
  };
}

/**
 * Get preview of all possible next states
 *
 * @param card - Current card state
 * @param desiredRetention - Target retention rate
 * @param weights - FSRS parameters
 * @returns Preview of all ratings with due dates
 */
export function previewRatings(
  card: Card,
  desiredRetention: number = 0.9,
  weights: number[] | null = null
): {
  again: { interval: number; due: Date };
  hard: { interval: number; due: Date };
  good: { interval: number; due: Date };
  easy: { interval: number; due: Date };
} {
  const now = new Date();

  // Calculate elapsed days
  const lastReview = card.lastReview || card.due;
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Get memory state
  const memory: MemoryState | null =
    card.state === State.New
      ? null
      : {
        stability: card.stability,
        difficulty: card.difficulty,
      };

  // Get all next states
  const states = nextStates(memory, desiredRetention, elapsedDays, weights);

  const toPreview = (state: CardState) => ({
    interval: state.interval,
    due: new Date(now.getTime() + state.interval * 24 * 60 * 60 * 1000),
  });

  return {
    again: toPreview(states.again),
    hard: toPreview(states.hard),
    good: toPreview(states.good),
    easy: toPreview(states.easy),
  };
}

// Default export
export default {
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
};
