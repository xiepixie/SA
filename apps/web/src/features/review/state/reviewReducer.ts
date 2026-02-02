import type { ReviewSortMode } from '../../../app/utils/reviewSortUtils';

export type ReviewStep = 'IDLE' | 'STRATEGY' | 'STUDYING' | 'REVEALED' | 'SUBMITTING' | 'COMPLETED';

export interface ReviewState {
    step: ReviewStep;
    currentIndex: number;
    completedIndices: Set<number>;
    userAnswer: any;
    visibleHints: number;
    activeNotesTab: 'hints' | 'notes' | 'backlinks';
    showNotesPanel: boolean;
    sortMode: ReviewSortMode;
    isStrategyConfirmed: boolean;
}

export type ReviewAction =
    | { type: 'START_SESSION'; sortMode: ReviewSortMode }
    | { type: 'REVEAL_ANSWER' }
    | { type: 'SET_USER_ANSWER'; answer: any }
    | { type: 'REVEAL_HINT' }
    | { type: 'NEXT_QUESTION'; nextIndex: number }
    | { type: 'COMPLETE_SESSION' }
    | { type: 'RESET_SESSION' }
    | { type: 'SET_NOTES_TAB'; tab: 'hints' | 'notes' | 'backlinks' }
    | { type: 'TOGGLE_NOTES'; open?: boolean }
    | { type: 'UNDO_RATING'; prevIndex: number }
    | { type: 'RATE_SUCCESS'; nextIndex: number | 'COMPLETED' };

export const initialReviewState: ReviewState = {
    step: 'IDLE',
    currentIndex: 0,
    completedIndices: new Set(),
    userAnswer: null,
    visibleHints: 0,
    activeNotesTab: 'notes',
    showNotesPanel: true,
    sortMode: 'optimal',
    isStrategyConfirmed: false,
};

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
    switch (action.type) {
        case 'START_SESSION':
            return {
                ...state,
                step: 'STUDYING',
                sortMode: action.sortMode,
                isStrategyConfirmed: true,
                currentIndex: 0,
                completedIndices: new Set(),
            };
        case 'REVEAL_ANSWER':
            return {
                ...state,
                step: 'REVEALED',
            };
        case 'SET_USER_ANSWER':
            return {
                ...state,
                userAnswer: action.answer,
            };
        case 'REVEAL_HINT':
            return {
                ...state,
                visibleHints: state.visibleHints + 1,
                activeNotesTab: 'hints',
                showNotesPanel: true,
            };
        case 'NEXT_QUESTION':
            return {
                ...state,
                step: 'STUDYING',
                currentIndex: action.nextIndex,
                userAnswer: null,
                visibleHints: 0,
            };
        case 'COMPLETE_SESSION':
            return {
                ...state,
                step: 'COMPLETED',
            };
        case 'RESET_SESSION':
            return initialReviewState;
        case 'SET_NOTES_TAB':
            return {
                ...state,
                activeNotesTab: action.tab,
            };
        case 'TOGGLE_NOTES':
            return {
                ...state,
                showNotesPanel: action.open ?? !state.showNotesPanel,
            };
        case 'UNDO_RATING':
            const newCompleted = new Set(state.completedIndices);
            newCompleted.delete(action.prevIndex);
            return {
                ...state,
                step: 'REVEALED',
                currentIndex: action.prevIndex,
                completedIndices: newCompleted,
            };
        case 'RATE_SUCCESS':
            const updatedCompleted = new Set(state.completedIndices);
            updatedCompleted.add(state.currentIndex);
            if (action.nextIndex === 'COMPLETED') {
                return {
                    ...state,
                    step: 'COMPLETED',
                    completedIndices: updatedCompleted,
                    userAnswer: null,
                    visibleHints: 0,
                };
            }
            return {
                ...state,
                step: 'STUDYING',
                currentIndex: action.nextIndex,
                completedIndices: updatedCompleted,
                userAnswer: null,
                visibleHints: 0,
            };
        default:
            return state;
    }
}
