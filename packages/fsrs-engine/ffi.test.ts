/**
 * FSRS Engine Tests
 *
 * Run with: bun test
 * Note: Requires `cargo build --release` first
 */

import { describe, expect, test } from "bun:test";
import {
  nextStates,
  review,
  migrateFromSm2,
  retrievability,
  nextInterval,
  version,
  defaultParameters,
  createCard,
  processReview,
  previewRatings,
  Rating,
  State,
  type MemoryState,
} from "./ffi";

describe("FSRS Engine FFI", () => {
  // ============================================================
  // Core Functions
  // ============================================================

  describe("version()", () => {
    test("returns version string", () => {
      const v = version();
      expect(v).toBeTruthy();
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
      console.log(`FSRS Engine version: ${v}`);
    });
  });

  describe("defaultParameters()", () => {
    test("returns parameters array", () => {
      const params = defaultParameters();
      expect(params).toBeArray();
      expect(params.length).toBeGreaterThanOrEqual(17);
      console.log(`Default parameters: ${params.length} values`);
    });
  });

  describe("nextStates()", () => {
    test("calculates states for new card", () => {
      const states = nextStates(null, 0.9, 0);

      expect(states.again).toBeDefined();
      expect(states.hard).toBeDefined();
      expect(states.good).toBeDefined();
      expect(states.easy).toBeDefined();

      // Intervals should increase: again <= hard <= good <= easy
      expect(states.again.interval).toBeLessThanOrEqual(states.hard.interval);
      expect(states.hard.interval).toBeLessThanOrEqual(states.good.interval);
      expect(states.good.interval).toBeLessThanOrEqual(states.easy.interval);

      console.log("New card intervals:", {
        again: states.again.interval.toFixed(2),
        hard: states.hard.interval.toFixed(2),
        good: states.good.interval.toFixed(2),
        easy: states.easy.interval.toFixed(2),
      });
    });

    test("calculates states for existing card", () => {
      const memory: MemoryState = {
        stability: 10,
        difficulty: 5,
      };

      const states = nextStates(memory, 0.9, 5);

      expect(states.good.stability).toBeGreaterThan(0);
      expect(states.good.difficulty).toBeGreaterThan(0);
      expect(states.good.interval).toBeGreaterThan(0);

      console.log("Existing card (5 days elapsed):", {
        again: states.again.interval.toFixed(2),
        good: states.good.interval.toFixed(2),
        easy: states.easy.interval.toFixed(2),
      });
    });

    test("respects desired retention", () => {
      const memory: MemoryState = { stability: 10, difficulty: 5 };

      const high = nextStates(memory, 0.95, 5);
      const low = nextStates(memory, 0.8, 5);

      // Higher retention = shorter intervals
      expect(high.good.interval).toBeLessThan(low.good.interval);
    });
  });

  describe("review()", () => {
    test("processes review for new card", () => {
      const result = review(null, Rating.Good, 0.9, 0);

      expect(result.selected).toBeDefined();
      expect(result.all_states).toBeDefined();
      expect(result.retrievability).toBe(1); // New card = 100%

      expect(result.selected.stability).toBeGreaterThan(0);
      expect(result.selected.difficulty).toBeGreaterThan(0);
    });

    test("processes review for existing card", () => {
      const memory: MemoryState = { stability: 10, difficulty: 5 };
      const result = review(memory, Rating.Good, 0.9, 5);

      expect(result.selected.stability).toBeGreaterThan(0);
      expect(result.retrievability).toBeGreaterThan(0);
      expect(result.retrievability).toBeLessThanOrEqual(1);

      console.log(`Retrievability after 5 days: ${(result.retrievability * 100).toFixed(1)}%`);
    });

    test("Again rating decreases stability", () => {
      const memory: MemoryState = { stability: 10, difficulty: 5 };

      const again = review(memory, Rating.Again, 0.9, 5);
      const good = review(memory, Rating.Good, 0.9, 5);

      expect(again.selected.stability).toBeLessThan(good.selected.stability);
    });

    test("throws on invalid rating", () => {
      expect(() => review(null, 0, 0.9, 0)).toThrow();
      expect(() => review(null, 5, 0.9, 0)).toThrow();
    });
  });

  describe("migrateFromSm2()", () => {
    test("migrates SM-2 card to FSRS", () => {
      const memory = migrateFromSm2(2.5, 10, 0.9);

      expect(memory.stability).toBeGreaterThan(0);
      expect(memory.difficulty).toBeGreaterThan(0);
      expect(memory.difficulty).toBeLessThanOrEqual(10);

      console.log("SM-2 migration result:", {
        stability: memory.stability.toFixed(2),
        difficulty: memory.difficulty.toFixed(2),
      });
    });

    test("higher ease factor = lower difficulty", () => {
      const easy = migrateFromSm2(3.0, 10, 0.9);
      const hard = migrateFromSm2(1.5, 10, 0.9);

      expect(easy.difficulty).toBeLessThan(hard.difficulty);
    });
  });

  describe("retrievability()", () => {
    test("calculates retrievability", () => {
      const r = retrievability(10, 5, 5);

      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    });

    test("retrievability decreases over time", () => {
      const day1 = retrievability(10, 5, 1);
      const day5 = retrievability(10, 5, 5);
      const day10 = retrievability(10, 5, 10);

      expect(day1).toBeGreaterThan(day5);
      expect(day5).toBeGreaterThan(day10);
    });

    test("higher stability = slower decay", () => {
      const lowStability = retrievability(5, 5, 10);
      const highStability = retrievability(20, 5, 10);

      expect(highStability).toBeGreaterThan(lowStability);
    });
  });

  describe("nextInterval()", () => {
    test("calculates next interval", () => {
      const interval = nextInterval(10, 0.9, Rating.Good);

      expect(interval).toBeGreaterThan(0);
    });

    test("new card interval", () => {
      const interval = nextInterval(0, 0.9, Rating.Good);

      expect(interval).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // High-Level API
  // ============================================================

  describe("createCard()", () => {
    test("creates new card with defaults", () => {
      const card = createCard();

      expect(card.state).toBe(State.New);
      expect(card.stability).toBe(0);
      expect(card.difficulty).toBe(0);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.due).toBeInstanceOf(Date);
    });
  });

  describe("processReview()", () => {
    test("processes first review", () => {
      const card = createCard();
      const updated = processReview(card, Rating.Good);

      expect(updated.state).not.toBe(State.New);
      expect(updated.stability).toBeGreaterThan(0);
      expect(updated.difficulty).toBeGreaterThan(0);
      expect(updated.reps).toBe(1);
      expect(updated.lapses).toBe(0);
      expect(updated.lastReview).toBeInstanceOf(Date);
      // Due date should be >= now (could be same time for learning cards with 0 interval)
      expect(updated.due.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });

    test("Again increases lapses", () => {
      let card = createCard();
      card = processReview(card, Rating.Good);
      card = processReview(card, Rating.Again);

      expect(card.lapses).toBe(1);
    });

    test("multiple reviews increase reps", () => {
      let card = createCard();
      card = processReview(card, Rating.Good);
      card = processReview(card, Rating.Good);
      card = processReview(card, Rating.Good);

      expect(card.reps).toBe(3);
    });

    test("state transitions correctly", () => {
      let card = createCard();
      expect(card.state).toBe(State.New);

      // First Good review -> Learning or Review
      card = processReview(card, Rating.Good);
      expect([State.Learning, State.Review]).toContain(card.state);

      // After enough reviews with Good -> Review
      for (let i = 0; i < 5; i++) {
        card = processReview(card, Rating.Good);
      }
      expect(card.state).toBe(State.Review);
    });
  });

  describe("previewRatings()", () => {
    test("previews all ratings for new card", () => {
      const card = createCard();
      const preview = previewRatings(card);

      expect(preview.again).toBeDefined();
      expect(preview.hard).toBeDefined();
      expect(preview.good).toBeDefined();
      expect(preview.easy).toBeDefined();

      expect(preview.again.due).toBeInstanceOf(Date);
      expect(preview.good.due).toBeInstanceOf(Date);

      // Intervals should increase
      expect(preview.again.interval).toBeLessThanOrEqual(preview.hard.interval);
      expect(preview.hard.interval).toBeLessThanOrEqual(preview.good.interval);
      expect(preview.good.interval).toBeLessThanOrEqual(preview.easy.interval);

      console.log("Preview for new card:", {
        again: `${preview.again.interval.toFixed(2)} days`,
        hard: `${preview.hard.interval.toFixed(2)} days`,
        good: `${preview.good.interval.toFixed(2)} days`,
        easy: `${preview.easy.interval.toFixed(2)} days`,
      });
    });

    test("previews all ratings for existing card", () => {
      let card = createCard();
      card = processReview(card, Rating.Good);
      card = processReview(card, Rating.Good);

      const preview = previewRatings(card);

      expect(preview.good.interval).toBeGreaterThan(0);

      console.log("Preview for reviewed card:", {
        again: `${preview.again.interval.toFixed(2)} days`,
        good: `${preview.good.interval.toFixed(2)} days`,
        easy: `${preview.easy.interval.toFixed(2)} days`,
      });
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe("Integration", () => {
    test("full learning cycle", () => {
      let card = createCard();
      const history: { rating: Rating; interval: number; state: State }[] = [];

      // Simulate learning cycle
      const ratings = [
        Rating.Good,
        Rating.Good,
        Rating.Hard,
        Rating.Good,
        Rating.Easy,
        Rating.Good,
        Rating.Again,
        Rating.Good,
        Rating.Good,
      ];

      for (const rating of ratings) {
        card = processReview(card, rating);
        history.push({
          rating,
          interval: card.scheduledDays,
          state: card.state,
        });
      }

      console.log("Learning cycle:");
      history.forEach((h, i) => {
        const ratingName = Rating[h.rating];
        const stateName = State[h.state];
        console.log(`  ${i + 1}. ${ratingName} -> ${h.interval} days (${stateName})`);
      });

      expect(card.reps).toBe(ratings.length);
      expect(card.lapses).toBe(1); // One Again
    });

    test("custom weights", () => {
      const defaultParams = defaultParameters();
      const customWeights = defaultParams.map((p) => p * 1.1); // Slightly modified

      // Use a card that's already in Review state to see weight differences
      // New cards in Learning state may have 0 interval regardless of weights
      let card = createCard();
      card = processReview(card, Rating.Good); // First review
      card = processReview(card, Rating.Good); // Second review - now in Review state

      const defaultResult = processReview(card, Rating.Good, 0.9, null);
      const customResult = processReview(card, Rating.Good, 0.9, customWeights);

      // Both should produce valid results
      expect(defaultResult.scheduledDays).toBeGreaterThanOrEqual(0);
      expect(customResult.scheduledDays).toBeGreaterThanOrEqual(0);
      
      console.log(`Default: ${defaultResult.scheduledDays}, Custom: ${customResult.scheduledDays}`);
    });
  });
});
