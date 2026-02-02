import { useReducer, useCallback, useMemo } from 'react';
import { reviewReducer, initialReviewState } from '../state/reviewReducer';
import type { ReviewSortMode } from '../../../app/utils/reviewSortUtils';

export const useReviewWizard = (cards: any[]) => {
    const [state, dispatch] = useReducer(reviewReducer, initialReviewState);

    // --- Selectors ---
    const currentCard = useMemo(() => cards[state.currentIndex], [cards, state.currentIndex]);
    const isSessionLoading = useMemo(() => cards.length === 0, [cards]);
    const progress = useMemo(() => {
        if (cards.length === 0) return 0;
        return (state.completedIndices.size / cards.length) * 100;
    }, [cards.length, state.completedIndices.size]);

    // --- Actions ---
    const startSession = useCallback((sortMode: ReviewSortMode) => {
        dispatch({ type: 'START_SESSION', sortMode });
    }, []);

    const revealAnswer = useCallback(() => {
        dispatch({ type: 'REVEAL_ANSWER' });
    }, []);

    const setUserAnswer = useCallback((answer: any) => {
        dispatch({ type: 'SET_USER_ANSWER', answer });
    }, []);

    const revealHint = useCallback(() => {
        dispatch({ type: 'REVEAL_HINT' });
    }, []);

    const nextQuestion = useCallback((nextIndex: number) => {
        dispatch({ type: 'NEXT_QUESTION', nextIndex });
    }, []);

    const completeSession = useCallback(() => {
        dispatch({ type: 'COMPLETE_SESSION' });
    }, []);

    const setNotesTab = useCallback((tab: 'hints' | 'notes' | 'backlinks') => {
        dispatch({ type: 'SET_NOTES_TAB', tab });
    }, []);

    const toggleNotes = useCallback((open?: boolean) => {
        dispatch({ type: 'TOGGLE_NOTES', open });
    }, []);

    const undoRating = useCallback((prevIndex: number) => {
        dispatch({ type: 'UNDO_RATING', prevIndex });
    }, []);

    const resetSession = useCallback(() => {
        dispatch({ type: 'RESET_SESSION' });
    }, []);

    const rateSuccess = useCallback(() => {
        const nextPending = cards.findIndex((_, idx) => !state.completedIndices.has(idx) && idx > state.currentIndex);
        const actualNext = nextPending !== -1 ? nextPending : cards.findIndex((_, idx) => !state.completedIndices.has(idx) && idx !== state.currentIndex);

        if (actualNext !== -1) {
            dispatch({ type: 'RATE_SUCCESS', nextIndex: actualNext });
        } else if (state.completedIndices.size + 1 >= cards.length) {
            dispatch({ type: 'RATE_SUCCESS', nextIndex: 'COMPLETED' });
        }
    }, [cards, state.currentIndex, state.completedIndices]);

    return {
        ...state,
        currentCard,
        isSessionLoading,
        progress,
        actions: {
            startSession,
            revealAnswer,
            setUserAnswer,
            revealHint,
            nextQuestion,
            completeSession,
            setNotesTab,
            toggleNotes,
            undoRating,
            resetSession,
            rateSuccess
        }
    };
};
