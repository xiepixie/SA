import React from 'react';

/**
 * Base Shell for page skeletons to maintain consistent layout
 */
const PageShellSkeleton: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface">
        <div className="max-w-7xl mx-auto w-full flex flex-col gap-8 opacity-50">
            {children}
        </div>
    </div>
);

export const WelcomeSkeleton = () => (
    <PageShellSkeleton>
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end justify-between">
            <div className="space-y-2">
                <div className="skeleton h-6 w-48 rounded-lg" />
            </div>
            <div className="skeleton h-12 w-40 rounded-xl" />
        </div>

        {/* Hero Card Skeleton */}
        <div className="glass-card min-h-[300px] p-8 md:p-12 space-y-6">
            <div className="skeleton h-4 w-20 rounded-full" />
            <div className="skeleton h-12 w-64 rounded-xl" />
            <div className="skeleton h-6 w-96 rounded-lg" />
            <div className="skeleton h-14 w-44 rounded-xl mt-4" />
        </div>

        {/* Action Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="skeleton h-40 w-full rounded-2xl" />
            ))}
        </div>
    </PageShellSkeleton>
);

export const DashboardSkeleton = () => (
    <PageShellSkeleton>
        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="skeleton h-32 w-full rounded-2xl" />
            ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 skeleton h-[400px] w-full rounded-2xl" />
            <div className="skeleton h-[400px] w-full rounded-2xl" />
        </div>

        {/* Discipline Map Skeleton */}
        <div className="skeleton h-48 w-full rounded-2xl" />
    </PageShellSkeleton>
);

export const LibrarySkeleton = () => (
    <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface opacity-50">
        <div className="max-w-7xl mx-auto w-full space-y-6">
            {/* Toolbar */}
            <div className="flex items-center gap-4">
                <div className="skeleton h-10 flex-1 max-w-md rounded-xl" />
                <div className="skeleton h-10 w-24 rounded-xl" />
                <div className="skeleton h-10 w-24 rounded-xl" />
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* List */}
                <div className="xl:col-span-3 space-y-3">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="skeleton h-14 w-full rounded-xl" />
                    ))}
                </div>
                {/* Inspector Placeholder */}
                <div className="hidden xl:block space-y-6">
                    <div className="skeleton h-8 w-48 rounded-lg" />
                    <div className="skeleton h-64 w-full rounded-2xl" />
                    <div className="space-y-4">
                        <div className="skeleton h-4 w-full rounded" />
                        <div className="skeleton h-4 w-5/6 rounded" />
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export const ReviewSkeleton = () => (
    <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface relative opacity-50">
        <div className="max-w-4xl mx-auto w-full space-y-8">
            {/* Header Skeleton */}
            <div className="glass-card p-6 rounded-2xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="skeleton h-10 w-10 rounded-xl" />
                        <div className="space-y-2">
                            <div className="skeleton h-4 w-32 rounded-lg" />
                            <div className="skeleton h-3 w-20 rounded" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="skeleton h-8 w-8 rounded-lg" />
                        <div className="skeleton h-8 w-8 rounded-lg" />
                    </div>
                </div>
            </div>

            {/* Main Content Skeleton */}
            <div className="glass-card-premium p-8 md:p-12 rounded-[2.5rem] space-y-8">
                {/* Central Loading Visual */}
                <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                    {/* Layered Orbitals */}
                    <div className="absolute inset-0 rounded-full border border-dashed border-primary/20 animate-spin-slow opacity-30" />
                    <div className="absolute inset-4 rounded-full border border-primary/10 animate-spin-slow-reverse opacity-20" />

                    <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center shadow-premium-lg border border-primary/10">
                        <div className="w-8 h-8 rounded-full bg-primary/10 animate-pulse border border-primary/20" />
                    </div>
                </div>

                {/* Question Placeholder */}
                <div className="space-y-4 text-center max-w-xl mx-auto">
                    <div className="skeleton h-8 w-3/4 rounded-xl mx-auto" />
                    <div className="skeleton h-4 w-1/2 rounded-lg mx-auto" />
                </div>

                {/* Choices Placeholder */}
                <div className="space-y-3 max-w-lg mx-auto">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="skeleton h-12 w-full rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
                    ))}
                </div>

                {/* Action Button Placeholder */}
                <div className="skeleton h-12 w-48 rounded-xl mx-auto" />
            </div>

            {/* Bottom Progress Indicator */}
            <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i <= 2 ? 'bg-primary/30' : 'bg-base-content/10'}`} />
                ))}
            </div>
        </div>
    </div>
);

export const SettingsSkeleton = () => (
    <PageShellSkeleton>
        <div className="flex items-center gap-4 mb-8">
            <div className="skeleton w-12 h-12 rounded-xl" />
            <div className="space-y-2">
                <div className="skeleton h-6 w-48 rounded-lg" />
                <div className="skeleton h-4 w-32 rounded-lg" />
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 space-y-2">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="skeleton h-12 w-full rounded-xl" />
                ))}
            </div>
            <div className="lg:col-span-3 space-y-8">
                <div className="skeleton h-[400px] w-full rounded-3xl" />
            </div>
        </div>
    </PageShellSkeleton>
);

export const SyncSkeleton = () => (
    <PageShellSkeleton>
        <div className="glass-card p-8 space-y-4">
            <div className="skeleton h-4 w-24 rounded-full" />
            <div className="skeleton h-10 w-64 rounded-xl" />
            <div className="skeleton h-4 w-full max-w-lg rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="skeleton h-48 w-full rounded-2xl" />
            ))}
        </div>
    </PageShellSkeleton>
);

export const ManageSkeleton = () => (
    <div className="flex-1 min-h-full p-4 md:p-12 lg:p-16 pb-24 bg-mesh-surface opacity-50">
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="flex justify-between items-center">
                <div className="skeleton h-8 w-48 rounded-lg" />
                <div className="flex gap-2">
                    <div className="skeleton h-10 w-24 rounded-xl" />
                    <div className="skeleton h-10 w-24 rounded-xl" />
                </div>
            </div>
            <div className="flex gap-4 border-b border-base-content/5 pb-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton h-8 w-20 rounded-lg" />
                ))}
            </div>
            <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="skeleton h-16 w-full rounded-xl" />
                ))}
            </div>
        </div>
    </div>
);

export const GenericSkeleton = () => (
    <PageShellSkeleton>
        <div className="flex items-center gap-4 mb-8">
            <div className="skeleton w-12 h-12 rounded-xl" />
            <div className="space-y-2">
                <div className="skeleton h-6 w-48 rounded-lg" />
                <div className="skeleton h-4 w-32 rounded-lg" />
            </div>
        </div>
        <div className="space-y-4">
            <div className="skeleton h-32 w-full rounded-2xl" />
            <div className="skeleton h-64 w-full rounded-2xl" />
            <div className="grid grid-cols-2 gap-4">
                <div className="skeleton h-32 w-full rounded-2xl" />
                <div className="skeleton h-32 w-full rounded-2xl" />
            </div>
        </div>
    </PageShellSkeleton>
);
