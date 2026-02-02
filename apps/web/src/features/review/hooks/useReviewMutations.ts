import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v2Api } from '../../../app/api/views';

export const useReviewMutations = () => {
    const queryClient = useQueryClient();

    const submitReviewMutation = useMutation({
        mutationFn: (params: {
            card_id: string;
            rating: 1 | 2 | 3 | 4;
            stability: number;
            difficulty: number;
            days_elapsed: number;
            duration_ms?: number;
            subject_id?: string;
        }) => v2Api.submitReview(params),
        onSuccess: () => {
            // Invalidate relevant queries like dashboard stats or due list
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['due-list'] });
        }
    });

    return {
        submitReview: submitReviewMutation
    };
};
