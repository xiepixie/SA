import { queryClient } from './client'
import { useAppStore } from '../app/state/useAppStore'
import type { StaleKey } from '@v2/shared'

const REVALIDATE_CONFIG: Record<string, { queryKey: any[] | any[][]; priority: number }> = {
    'v:due_list': { queryKey: ['study', 'due-list'], priority: 10 },
    'v:question_list': { queryKey: ['questions'], priority: 8 },
    'v:asset': { queryKey: [['subjects'], ['tags']], priority: 5 },
    'v:dashboard': { queryKey: ['study', 'dashboard'], priority: 12 },
}

class RevalidationScheduler {
    private inflight = new Set<StaleKey>()
    private queue: { key: StaleKey; priority: number }[] = []
    private maxConcurrent = 3

    constructor() {
        // Subscribe to Zustand stale map changes
        useAppStore.subscribe(
            (state) => state.stale,
            (stale) => this.onStaleChange(stale)
        )
    }

    private onStaleChange(stale: Record<StaleKey, { markedAt: number }>) {
        Object.keys(stale).forEach((key) => {
            if (key.startsWith('v:')) {
                this.schedule(key as StaleKey)
            }
        })
    }

    private schedule(key: StaleKey) {
        if (this.inflight.has(key)) return
        if (this.queue.some((item) => item.key === key)) return

        const config = REVALIDATE_CONFIG[key] || { queryKey: [key], priority: 1 }
        this.queue.push({ key, priority: config.priority })
        this.queue.sort((a, b) => b.priority - a.priority)

        this.processQueue()
    }

    private async processQueue() {
        if (this.inflight.size >= this.maxConcurrent) return
        if (this.queue.length === 0) return

        const next = this.queue.shift()!
        this.inflight.add(next.key)

        const config = REVALIDATE_CONFIG[next.key] || { queryKey: [next.key], priority: 1 }

        try {
            // Trigger TanStack Query revalidation
            if (Array.isArray(config.queryKey[0])) {
                // Multi-key invalidation
                await Promise.all(
                    (config.queryKey as any[][]).map(key =>
                        queryClient.invalidateQueries({ queryKey: key })
                    )
                )
            } else {
                await queryClient.invalidateQueries({ queryKey: config.queryKey as any[] })
            }

            // Clear stale flag in store after successful revalidation
            useAppStore.getState().clearStale(next.key)
        } catch (error) {
            console.error(`Failed to revalidate ${next.key}:`, error)
        } finally {
            this.inflight.delete(next.key)
            this.processQueue()
        }
    }
}

export const scheduler = new RevalidationScheduler()
