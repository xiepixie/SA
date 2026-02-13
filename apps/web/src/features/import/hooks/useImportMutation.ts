/**
 * useImportMutation - TanStack Query mutation for import execution
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportItem, ImportPipelineResult } from '@v2/shared';
import { api } from '../../../lib/eden';
import { supabase } from '../../../lib/supabase';
import { validateItem } from '../../../lib/importUtils';
import { questionKeys } from '../../../queries/keys';
import { useAppStore } from '../../../app/state/useAppStore';

export interface ImportMutationVariables {
    items: ImportItem[];
    config?: {
        create_cards?: boolean;
        cards_due_spread?: 'immediate' | 'spread_1d' | 'spread_7d';
        cards_due_start?: string;
        allowDuplicates?: boolean;
    };
}

export interface ImportMutationResult {
    result: ImportPipelineResult;
}

export function useImportMutation() {
    const queryClient = useQueryClient();
    const { addImportTask, updateImportTask, pushEffect } = useAppStore();

    return useMutation<ImportPipelineResult, Error, ImportMutationVariables>({
        mutationFn: async ({ items, config }) => {
            // Register background task
            const taskId = addImportTask({
                title: `Importing ${items.length} items`,
                total: items.length,
            });

            try {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    throw new Error('User not authenticated');
                }

                updateImportTask(taskId, { progress: 10 });

                // Re-validate all items
                const freshIssues = items.flatMap(item => validateItem(item));
                const invalidRows = new Set(
                    freshIssues
                        .filter(i => i.level === 'error')
                        .map(i => i.row)
                );
                const validItems = items.filter(it => !invalidRows.has(it.__row));

                if (validItems.length === 0) {
                    throw new Error('No valid items to import');
                }

                updateImportTask(taskId, { progress: 30 });

                // Call API
                const { data, error } = await api.api.v1.import.post({
                    userId: user.id,
                    items: validItems,
                    config: {
                        create_cards: config?.create_cards ?? true,
                        cards_due_spread: config?.cards_due_spread ?? 'spread_7d',
                        cards_due_start: config?.cards_due_start ?? new Date().toISOString(),
                        useAtomic: true,
                        allowDuplicates: config?.allowDuplicates,
                    },
                });

                if (error) {
                    const errorValue = error.value as any;
                    const errorMessage = errorValue?.message || errorValue?.error || 'Server error';
                    throw new Error(errorMessage);
                }

                const result = data as ImportPipelineResult;
                const isPartial = result.failed > 0 && result.success > 0;
                const status = isPartial ? 'partial' : (result.failed > 0 ? 'failed' : 'success');

                updateImportTask(taskId, {
                    status,
                    progress: 100,
                    successCount: result.success,
                    failedCount: result.failed,
                    result,
                });

                if (status === 'success') {
                    pushEffect({ type: 'toast', level: 'success', message: `Successfully imported ${result.success} items` });
                } else if (status === 'partial') {
                    pushEffect({ type: 'toast', level: 'warning', message: `Imported ${result.success} items, but ${result.failed} failed.` });
                }

                return result;
            } catch (err: any) {
                const errorMessage = err.message || 'Import failed';
                updateImportTask(taskId, {
                    status: 'failed',
                    error: errorMessage,
                });
                pushEffect({ type: 'toast', level: 'error', message: errorMessage });
                throw err;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: questionKeys.all });
        },
    });
}
