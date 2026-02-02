# V2 UX Design Architecture: Realtime-Driven, Low-Jitter

Built upon the **B.E.R.R.S. Stack**, this architecture ensures a "Pro-Level" experience for learning and asset management, focusing on multi-tab consistency, explainable events, and low-latency feedback.

## 1. Core Principles

### A. Multi-Tab Consistency (Pulse-Driven)
*   **High-Frequency State**: `cards_sync_pulse` and `user_dashboard_pulse` ensure that learning progress (due dates, streaks) is synchronized across tabs in <1s.
*   **Zero-Refresh Requirement**: UI components (like the streak counter or card status badges) subscribe to specific entity IDs and update reactively.

### B. Low-Jitter View Updates (Signal-Driven)
*   **Diff-Merge Policy**: View endpoints (`/v/due-list`, etc.) return delta-friendly response structures. The frontend merges these into the `Entity Store` rather than replacing the entire list, preventing "Layout Shift" and preserving scroll position.
*   **Tiny Sync Indicators**: Instead of full-page skeletons, a 150ms-debounced "Syncing..." dot appears in the header to indicate background activity.

### C. Explainable UX (Reasoning-Aware)
*   Signals carry a `reason` (e.g., `tags_changed`, `source_updated`).
*   **Fork Drift Detection**: When `source_updated` is detected, a persistent "Source Changed" badge appears on the question card with a direct "Compare & Sync" action.

---

## 2. Technical Implementation: The "Three-Layer + Bus" Model

### Layer 1: Entity Store (Zustand)
*   **Canonical Source**: Normalized maps of `cards`, `questions`, `jobs`, and `dashboard`.
*   **Watermark Persistence**: `Record<WatermarkKey, string>` where key includes `source:topic:entityKey`.
*   **Stale Registry**: Tracks which views are "dirty" and need revalidation.

### Layer 2: View Cache (TanStack Query)
*   Queries serve as "projections" of the entity store.
*   All Query fetches trigger `mergeIntoEntities()` upon completion.

### Layer 3: Connection Guard (Supabase Realtime)
*   **3+1 Subscription Model**: 1 Signal table + 3 Pulse tables.
*   **Disconnected Recovery**: Upon reconnection, a global `REFRESH` signal is simulated for critical views (`dashboard`, `due-list`).

---

## 3. Optimization Checklist (The "8 Pillars")

| Feature | Implementation Detail | Status |
| :--- | :--- | :--- |
| **Dashboard Topic** | Explicit `topic: "dashboard"` for streak/count sync. | 🛠️ |
| **Source-Aware Watermark** | Key format: `${source}:${topic}:${id}` to prevent pulse/signal race. | 🛠️ |
| **Clock/Seq Tie-Break** | Compare `(updatedAt, seq)` to handle same-ms conflicts. | 🛠️ |
| **ViewKey Prioritization** | `staleMap` uses explicit `v:due_list` keys. | ✅ |
| **UX Effect Grading** | `silent` (badge) vs `toast` (job status). | 🛠️ |
| **Diff-Merge API** | `{ items, deletedIds, serverTime }` standard. | ✅ |
| **Visibility Awareness** | Scheduler only runs revalidation for active/visible views. | 🛠️ |
| **Actionable Fork Drift** | "Compare & Sync" CTA for `source_updated` signals. | 🛠️ |
