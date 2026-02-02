import { differenceInDays, startOfDay } from 'date-fns';

/**
 * Review Sort Mode
 * Optimized for FSRS and learning psychology.
 */
export type ReviewSortMode =
    | 'optimal'         // Balanced: FSRS Predicted Retention + Difficulty
    | 'overdue-asc'     // Panic: Oldest overdue first (standard Anki-style)
    | 'mastery-asc'     // Focus: Lowest stability cards first (knowledge weak points)
    | 'difficulty-desc' // Challenge: Most complex cards first
    | 'random'          // Standard: Shuffled for interleaving practice
    | 'newest-asc';     // Fresh: Recently added items first

export interface SortOption {
    value: ReviewSortMode;
    labelKey: string;
    descriptionKey: string;
    icon: string;
}

export const SORT_OPTIONS: SortOption[] = [
    {
        value: 'optimal',
        labelKey: 'review.sort.optimal.label',
        descriptionKey: 'review.sort.optimal.desc',
        icon: '🎯',
    },
    {
        value: 'overdue-asc',
        labelKey: 'review.sort.overdue.label',
        descriptionKey: 'review.sort.overdue.desc',
        icon: '⏰',
    },
    {
        value: 'mastery-asc',
        labelKey: 'review.sort.weakness.label',
        descriptionKey: 'review.sort.weakness.desc',
        icon: '📉',
    },
    {
        value: 'difficulty-desc',
        labelKey: 'review.sort.challenge.label',
        descriptionKey: 'review.sort.challenge.desc',
        icon: '🔥',
    },
    {
        value: 'newest-asc',
        labelKey: 'review.sort.fresh.label',
        descriptionKey: 'review.sort.fresh.desc',
        icon: '🌱',
    },
    {
        value: 'random',
        labelKey: 'review.sort.random.label',
        descriptionKey: 'review.sort.random.desc',
        icon: '🎲',
    },
];

/**
 * Calculate urgency score for 'optimal' sorting
 */
const calculateOptimalScore = (card: any): number => {
    const now = new Date();
    const dueDate = card.due ? new Date(card.due) : now;
    const daysOverdue = Math.max(0, differenceInDays(now, startOfDay(dueDate)));

    // Stability: shorter stability means we are more likely to forget soon
    const stabilityScore = 1 / (card.stability || 1);

    // Difficulty: higher difficulty needs more attention
    const difficultyScore = (card.difficulty || 5) / 10;

    // Formula weighting: Overdue urgency (50%) + Stability fragility (30%) + Difficulty (20%)
    return (daysOverdue * 1.5) + (stabilityScore * 10) + (difficultyScore * 5);
};

export const sortCards = (cards: any[], mode: ReviewSortMode): any[] => {
    if (!cards || cards.length === 0) return [];
    const result = [...cards];

    switch (mode) {
        case 'optimal':
            return result.sort((a, b) => calculateOptimalScore(b) - calculateOptimalScore(a));

        case 'overdue-asc':
            return result.sort((a, b) => {
                const da = a.due ? new Date(a.due).getTime() : 0;
                const db = b.due ? new Date(b.due).getTime() : 0;
                return da - db;
            });

        case 'mastery-asc':
            return result.sort((a, b) => (a.stability || 0) - (b.stability || 0));

        case 'difficulty-desc':
            // Sort by question inherent difficulty first (hard > medium > easy),
            // then by FSRS calculated difficulty as tiebreaker
            const difficultyPriority: Record<string, number> = { hard: 3, medium: 2, easy: 1 };
            return result.sort((a, b) => {
                const qDiffA = difficultyPriority[a.question_difficulty] || 2;
                const qDiffB = difficultyPriority[b.question_difficulty] || 2;
                if (qDiffA !== qDiffB) return qDiffB - qDiffA;
                // Tiebreaker: higher FSRS difficulty (harder to learn) first
                return (b.difficulty || 5) - (a.difficulty || 5);
            });

        case 'newest-asc':
            // Prioritize most recently subscribed/created cards
            // Uses subscribed_at > created_at > updatedAt as fallback chain
            return result.sort((a, b) => {
                const ta = a.subscribed_at ? new Date(a.subscribed_at).getTime()
                    : (a.created_at ? new Date(a.created_at).getTime()
                        : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0));
                const tb = b.subscribed_at ? new Date(b.subscribed_at).getTime()
                    : (b.created_at ? new Date(b.created_at).getTime()
                        : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0));
                return tb - ta; // Newest first
            });

        case 'random':
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;

        default:
            return result;
    }
};
