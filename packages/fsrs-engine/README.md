# FSRS Engine

High-performance FSRS v5 spaced repetition scheduler using Rust FFI.

## Overview

This package provides a native Rust implementation of the FSRS (Free Spaced Repetition Scheduler) algorithm, exposed via FFI for use in Bun/Node.js applications.

**Key Features:**
- Pure Rust implementation using `rs-fsrs` crate (lightweight, no ML dependencies)
- Fast compilation (~5 seconds) and small binary size (~220KB)
- Thread-safe and stable FFI interface
- Full TypeScript type definitions
- High-level API for easy integration

## Installation

```bash
# Build the Rust library
bun run build

# Or for debug builds
bun run build:debug
```

## Usage

```typescript
import fsrs, { Rating, State } from '@v2/fsrs-engine'

// Create a new card
let card = fsrs.createCard()

// Process a review with Good rating
card = fsrs.processReview(card, Rating.Good)

// Preview all possible ratings
const preview = fsrs.previewRatings(card)
console.log(`Good: ${preview.good.interval} days`)
console.log(`Easy: ${preview.easy.interval} days`)

// Get current retrievability
const r = fsrs.retrievability(card.stability, card.difficulty, 5)
console.log(`Retrievability after 5 days: ${(r * 100).toFixed(1)}%`)
```

## API Reference

### Core Functions

#### `nextStates(memory, desiredRetention, daysElapsed, weights)`
Calculate next states for all ratings.

#### `review(memory, rating, desiredRetention, daysElapsed, weights)`
Process a review and get the result for a specific rating.

#### `retrievability(stability, difficulty, daysElapsed)`
Calculate current memory retrievability (0-1).

#### `migrateFromSm2(easeFactor, interval, retention, weights)`
Migrate SM-2 card data to FSRS memory state.

#### `defaultParameters()`
Get default FSRS parameters (19 values).

#### `version()`
Get library version.

### High-Level API

#### `createCard()`
Create a new card with default values.

#### `processReview(card, rating, desiredRetention?, weights?)`
Process a review and return updated card.

#### `previewRatings(card, desiredRetention?, weights?)`
Preview intervals for all possible ratings.

### Types

```typescript
enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

interface Card {
  state: State
  stability: number
  difficulty: number
  due: Date
  lastReview: Date | null
  reps: number
  lapses: number
  elapsedDays: number
  scheduledDays: number
}

interface MemoryState {
  stability: number
  difficulty: number
}
```

## Development

```bash
# Run Rust tests
bun run test

# Run TypeScript tests
bun run test:ts

# Clean build artifacts
bun run clean
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TypeScript API                        │
│  (ffi.ts - High-level functions, type definitions)      │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     Bun FFI Layer                        │
│  (dlopen, ptr, toArrayBuffer - Native bindings)         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Rust FFI Functions                     │
│  (lib.rs - C-compatible exports, JSON serialization)    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     rs-fsrs Crate                        │
│  (Pure Rust FSRS implementation - scheduling only)      │
└─────────────────────────────────────────────────────────┘
```

## Migration from fsrs crate

This package was migrated from the `fsrs` crate (v5.2) to `rs-fsrs` (v1.2) for the following reasons:

| Metric | Before (fsrs) | After (rs-fsrs) |
|--------|---------------|-----------------|
| Dependencies | ~250 crates | ~7 crates |
| Build time | 3+ minutes | ~5 seconds |
| DLL size | ~10 MB | ~220 KB |
| Runtime stability | Panics on init | Stable |

The `fsrs` crate includes the Burn ML framework for parameter training, which caused:
- Thread-safety issues (`FSRS` type not `Send + Sync`)
- "Backend not found" runtime panics
- Massive dependency tree

The `rs-fsrs` crate is a pure scheduling implementation without ML dependencies.

## License

MIT
