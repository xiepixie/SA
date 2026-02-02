import { useAppStore, type StaleEntry } from '../state/useAppStore';
import { REVALIDATE_ROUTES } from '../state/routes';

export class RevalidateScheduler {
    private queryClient: any;
    private api: any;

    // in-flight per key
    private inflight = new Set<string>();
    private controllers = new Map<string, AbortController>();
    private pending = new Set<string>(); // New: Wait for current inflight to finish then rerun

    // queue + coalesce
    private queued = new Set<string>();
    private queue: string[] = [];
    private scheduled = false;

    // reliability / control
    private retryCount = new Map<string, number>();
    private lastRunAt = new Map<string, number>();
    private lastOkAt = new Map<string, number>();

    private maxConcurrent = 2;
    private running = 0;
    private minIntervalMs = 800; // global base cooldown

    private unsubs: (() => void)[] = [];

    constructor(queryClient: any, api: any) {
        this.queryClient = queryClient;
        this.api = api;

        // 1) stale change: handle additions AND removals
        const unsubStale = useAppStore.subscribe(
            (s) => s.stale,
            (next, prev) => this.onStaleDiff(next as any, prev as any)
        );
        this.unsubs.push(unsubStale);

        // 2) active view change
        const unsubActive = useAppStore.subscribe(
            (s) => s.activeViews,
            (next, prev) => this.onActiveViewsDiff(next || {}, prev || {})
        );
        this.unsubs.push(unsubActive);

        if (typeof window !== 'undefined') {
            const onOnline = () => this.heartbeat();
            const onVisibility = () => {
                if (document.visibilityState === 'visible') this.heartbeat();
            };
            window.addEventListener('online', onOnline);
            document.addEventListener('visibilitychange', onVisibility);

            this.unsubs.push(() => {
                window.removeEventListener('online', onOnline);
                document.removeEventListener('visibilitychange', onVisibility);
            });
        }
    }

    public dispose() {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
        this.inflight.clear();
        this.controllers.forEach(c => c.abort());
        this.controllers.clear();
        this.pending.clear();
        this.queued.clear();
        this.queue = [];
    }

    private onStaleDiff(next: Record<string, StaleEntry>, prev: Record<string, StaleEntry>) {
        // A: Handle Additions / Updates
        for (const k of Object.keys(next)) {
            const n = next[k];
            const p = prev?.[k];

            // Check for change
            if (!p || p.markedAt !== n.markedAt || (p.priority ?? 0) !== (n.priority ?? 0) || !!p.prefetch !== !!n.prefetch || !!p.strong !== !!n.strong) {
                // If Inflight: Mark pending + check abort
                if (this.inflight.has(k)) {
                    this.pending.add(k);
                    const plan = REVALIDATE_ROUTES[k]?.(this.api);
                    const incomingPr = Math.max(n.priority ?? 0, plan?.priority ?? 0);

                    // Only abort if strong intent (tap/click) or significantly higher priority
                    if (n.strong || (!n.prefetch && incomingPr >= 80)) {
                        this.controllers.get(k)?.abort();
                    }
                    continue;
                }

                this.enqueue(k);
            }
        }

        // B: Handle Removals (Clean up queue if stale was cleared externally)
        for (const k of Object.keys(prev || {})) {
            if (!(k in next)) {
                if (this.queued.has(k)) {
                    this.queued.delete(k);
                    this.queue = this.queue.filter(x => x !== k);
                }
                // If pending, clear pending
                if (this.pending.has(k)) this.pending.delete(k);
            }
        }

        this.flushSoon();
    }

    private onActiveViewsDiff(next: Record<string, boolean>, prev: Record<string, boolean>) {
        const stale = useAppStore.getState().stale as Record<string, StaleEntry>;
        for (const k of Object.keys(next)) {
            const becameActive = !!next[k] && !prev?.[k];
            if (becameActive && stale[k]) {
                if (this.inflight.has(k)) {
                    this.pending.add(k); // Rerun after inflight if became active
                } else {
                    this.enqueue(k);
                }
            }
        }
        this.flushSoon();
    }

    private enqueue(key: string) {
        if (this.inflight.has(key)) return;
        if (this.queued.has(key)) return;
        if (key.startsWith('v:') && !REVALIDATE_ROUTES[key]) return;

        this.queued.add(key);
        this.queue.push(key);
    }

    private flushSoon() {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            this.flush();
        });
    }

    private canRun(key: string, entry?: StaleEntry) {
        const { activeViews } = useAppStore.getState();
        const isView = key.startsWith('v:');
        const isActive = !!activeViews[key];

        // visibility gating: view 不活跃，只有 prefetch 才能绕过
        if (isView && !isActive && !entry?.prefetch) return false;

        // Strong requests bypass cooldown (user-initiated or mount)
        if (entry?.strong) return true;

        // per-key dynamic cooldown
        const plan = REVALIDATE_ROUTES[key]?.(this.api);
        const cooldown = Math.max(this.minIntervalMs, plan?.minIntervalMs ?? 0);

        const now = Date.now();
        const last = this.lastRunAt.get(key) || 0;
        if (now - last < cooldown) return false;

        return true;
    }

    private pickNextKey() {
        const stale = useAppStore.getState().stale as Record<string, StaleEntry>;

        let bestIdx = -1;
        let bestScore = -Infinity;
        const now = Date.now();

        for (let i = 0; i < this.queue.length; i++) {
            const k = this.queue[i];
            const entry = stale[k];

            // Cleanup stale if disappeared or expired prefetch
            if (!entry) {
                // Should clean up queue but loop makes it hard, handled by onStaleDiff B mostly
                continue;
            }

            // Expired prefetch check
            if (entry.prefetch && entry.expiresAt && entry.expiresAt < now) {
                const { activeViews } = useAppStore.getState();
                if (!activeViews[k]) {
                    // Drop from stale (async cleanup, next run will catch it or onStaleDiff)
                    // Using setTimeout to avoid state update during render/loop (though this is not render)
                    setTimeout(() => {
                        useAppStore.setState(s => {
                            const n = { ...s.stale };
                            delete n[k];
                            return { stale: n };
                        });
                    }, 0);
                    continue;
                }
            }

            if (!this.canRun(k, entry)) continue;

            const plan = REVALIDATE_ROUTES[k]?.(this.api);
            // priority synthesis: max(stale_priority, plan_priority)
            const pr = Math.max(entry.priority ?? 0, plan?.priority ?? 0);

            const score = pr * 1_000_000 - entry.markedAt;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        if (bestIdx === -1) return null;

        const [key] = this.queue.splice(bestIdx, 1);
        this.queued.delete(key);
        return key;
    }

    private flush() {
        while (this.running < this.maxConcurrent) {
            const key = this.pickNextKey();
            if (!key) break;
            this.runRevalidation(key);
        }
    }

    private async runRevalidation(key: string) {
        const staleMap = useAppStore.getState().stale as Record<string, StaleEntry>;
        const entry = staleMap[key];

        const routeFn = REVALIDATE_ROUTES[key];
        if (!routeFn) return;

        if (!this.canRun(key, entry)) {
            this.enqueue(key);
            this.flushSoon();
            return;
        }

        // Abort previous inflight request for the same key if any
        this.controllers.get(key)?.abort();
        const controller = new AbortController();
        this.controllers.set(key, controller);

        this.inflight.add(key);
        this.running++;
        this.lastRunAt.set(key, Date.now());

        const plan = routeFn(this.api);

        try {
            // ✅ Use fetchQuery with staleTime: 0 to force network
            // AND pass signal to queryFn
            const data = await this.queryClient.fetchQuery({
                queryKey: plan.queryKey,
                queryFn: ({ signal }: { signal: AbortSignal }) => {
                    // Pass signal to fetcher (supports cancellation)
                    return plan.fetcher(signal);
                },
                staleTime: 0,
                gcTime: 5 * 60_000,
            });

            if (controller.signal.aborted) return;

            // ✅ merge + clearStale
            // CRITICAL: Create new objects for each entity slice to ensure Zustand detects changes
            useAppStore.setState((state) => {
                // Deep copy entities slices that will be modified
                const newEntities = {
                    ...state.entities,
                    questions: { ...state.entities.questions },
                    cardsPulse: { ...state.entities.cardsPulse },
                    assets: { ...state.entities.assets },
                    exams: { ...state.entities.exams },
                    dashboard: { ...state.entities.dashboard },
                    jobsPulse: { ...state.entities.jobsPulse },
                };
                plan.mergeIntoEntities(newEntities, data);
                const nextStale = { ...state.stale };
                delete nextStale[key];
                return { entities: newEntities, stale: nextStale };
            });

            this.lastOkAt.set(key, Date.now());
            this.retryCount.delete(key);
        } catch (err: any) {
            if (err.name === 'AbortError') return;

            const n = (this.retryCount.get(key) || 0) + 1;
            this.retryCount.set(key, n);

            const backoff = Math.min(30_000, 1000 * 2 ** Math.min(n, 5));
            console.error(`Revalidation failed for ${key} (retry in ${backoff}ms)`, err);

            setTimeout(() => {
                const s = useAppStore.getState().stale as Record<string, StaleEntry>;
                if (!s[key]) return;
                this.enqueue(key);
                this.flushSoon();
            }, backoff);
        } finally {
            if (this.controllers.get(key) === controller) {
                this.controllers.delete(key);
            }
            this.inflight.delete(key);
            this.running--;

            // Check pending: if key was marked stale again while inflight, re-queue it
            const stillStale = !!useAppStore.getState().stale[key];
            if (this.pending.has(key)) {
                this.pending.delete(key);
                if (stillStale) {
                    this.enqueue(key);
                }
            }

            this.flushSoon();
        }
    }

    public heartbeat(maxAgeMs = 10 * 60_000) {
        const { activeViews, stale } = useAppStore.getState() as any;
        const now = Date.now();

        for (const k of Object.keys(activeViews || {})) {
            if (!k.startsWith('v:')) continue;
            if (!activeViews[k]) continue;
            if (stale?.[k]) continue;

            const okAt = this.lastOkAt.get(k) || 0;
            if (now - okAt > maxAgeMs) {
                // Heartbeat is weak intent
                useAppStore.getState().markStale?.(k, 'heartbeat', 0, { prefetch: false, intent: 'heartbeat' } as any);
            }
        }
    }
}
