import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { handlePostgresChange } from './pipeline';
import { useAppStore } from '../state/useAppStore';

/**
 * Starts Subscriptions for the "3+1" Model (V5.9 Refined)
 * Returns a cleanup function to unsubscribe from all channels.
 */
export function startRealtime(userId: string) {
    const { markStale } = useAppStore.getState();
    const channels: RealtimeChannel[] = [];

    // 1. Initial Sync / Recovery
    // Force a one-time refetch of critical views on startup using the standardized v: prefix.
    // NOTE: v:question_list is intentionally excluded here.
    // The QuestionBank page uses TanStack Query (useQuestionBankFetch) for its data,
    // and no page registers useActiveView('v:question_list'), so the Scheduler
    // would never be able to process it anyway (canRun visibility gate blocks it).
    // Question data for other consumers (QuestionDetailPage, DashboardPage) enters
    // entities.questions via the v:due_list bridge and realtime entity patches.
    markStale('v:dashboard');
    markStale('v:due_list');
    markStale('v:asset');

    // 2. Realtime Signals
    console.log('[Realtime] Initializing rt-signals channel for user:', userId);
    const signalsChannel = supabase.channel('rt-signals')
        .on('postgres_changes', {
            event: 'INSERT', // Signals are immutable inserts
            schema: 'public',
            table: 'realtime_signals',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            console.log('[Realtime] Signal received:', payload.new);
            handlePostgresChange('realtime_signals', payload);
        })
        .subscribe((status) => {
            console.log('[Realtime] Subscription status for rt-signals:', status);
        });

    channels.push(signalsChannel);

    // 3. Pulse Channels
    const pulseTables = [
        'cards_sync_pulse',
        'import_jobs_pulse',
        'user_dashboard_pulse'
    ];

    pulseTables.forEach(table => {
        const pulseChannel = supabase.channel(`rt-${table}`)
            .on('postgres_changes', {
                event: '*', // Pulses use UPSERT (Insert/Update)
                schema: 'public',
                table: table,
                filter: `user_id=eq.${userId}`
            }, (payload) => handlePostgresChange(table, payload))
            .subscribe();

        channels.push(pulseChannel);
    });

    return () => {
        channels.forEach(ch => supabase.removeChannel(ch));
    };
}
