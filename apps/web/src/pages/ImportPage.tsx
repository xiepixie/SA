/**
 * ImportPage - Slim coordinator for the import wizard (V2 - Mutation Driven)
 *
 * This page uses the modular import feature architecture:
 * - useImportWizard: Main state management hook (pure UI state)
 * - useImportMutation: TanStack Query mutation for API calls
 * - ImportWizard: Step router component (mutation-driven rendering)
 *
 * Key V2 changes:
 * - Removed importStart/Error/Success actions - mutation handles async state
 * - Uses TRANSITION action for step changes
 * - Passes mutation to ImportWizard for loading/result rendering
 */

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useImportWizard, useImportMutation } from '../features/import';
import { ImportWizard } from '../features/import/components/ImportWizard';

export const ImportPage: React.FC = () => {
    const navigate = useNavigate();
    const wizard = useImportWizard();
    const mutation = useImportMutation();

    // Handle import execution
    const handleImport = useCallback(async () => {
        const { state, dispatch, actions, validItems } = wizard;

        if (!state.parseResult) return;

        // Transition to importing step (renders loading UI from mutation.isPending)
        dispatch(actions.transition('importing'));

        // Execute mutation - it handles validation, API call, and error states
        mutation.mutate(
            {
                items: validItems,
                config: {
                    create_cards: true,
                    cards_due_spread: 'spread_7d',
                    cards_due_start: new Date().toISOString(),
                    allowDuplicates: state.allowDuplicates,
                },
            },
            {
                onSuccess: () => {
                    // Transition to done step on success
                    dispatch(actions.transition('done'));
                },
                onError: () => {
                    // Transition to error step on mutation failure
                    dispatch(actions.transition('error'));
                },
            }
        );
    }, [wizard, mutation]);

    // Handle navigation to review page
    const handleNavigateToReview = useCallback(() => {
        navigate('/review');
    }, [navigate]);

    return (
        <ImportWizard
            wizard={wizard}
            mutation={mutation}
            onImport={handleImport}
            onNavigateToReview={handleNavigateToReview}
        />
    );
};
