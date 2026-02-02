import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, X, Maximize2, AlertCircle } from 'lucide-react';
import { cn } from '../../app/utils/cn';

interface ImageWithFallbackProps {
    src: string | null | undefined;
    alt?: string;
    className?: string;
    containerClassName?: string;
    showLightbox?: boolean;
}

/**
 * ImageWithFallback — Premium Image Component
 * 
 * Features:
 * - Loading skeletons with pulse animation
 * - Graceful error fallbacks
 * - Integrated Framer Motion lightbox
 * - High-performance GPU-accelerated transitions
 */
export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
    src,
    alt = "Question content image",
    className,
    containerClassName,
    showLightbox = true
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Prevent body scroll when lightbox is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!src) return null;

    return (
        <>
            <div className={cn("relative overflow-hidden rounded-2xl bg-base-content/[0.03] border border-base-content/5 group", containerClassName)}>
                {/* Skeleton */}
                {isLoading && (
                    <div className="absolute inset-0 animate-pulse bg-base-content/5 flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-base-content/10 flex items-center justify-center">
                            <ImageIcon className="text-base-content/20" size={24} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Optimizing Asset...</span>
                    </div>
                )}

                {/* Error State */}
                {hasError ? (
                    <div className="flex flex-col items-center justify-center p-12 text-base-content/30 gap-3 min-h-[160px] bg-error/5">
                        <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error/60">
                            <AlertCircle size={20} />
                        </div>
                        <div className="text-center space-y-1">
                            <span className="block text-[10px] font-black uppercase tracking-widest">Load Failure</span>
                            <span className="block text-[8px] font-bold opacity-60">SRV_ASSET_NOT_FOUND</span>
                        </div>
                    </div>
                ) : (
                    <div className="relative">
                        <img
                            src={src}
                            alt={alt}
                            onLoad={() => setIsLoading(false)}
                            onError={() => {
                                setIsLoading(false);
                                setHasError(true);
                            }}
                            className={cn(
                                "w-full h-auto max-h-[500px] object-contain transition-all duration-700 ease-out transform-gpu",
                                isLoading ? "opacity-0 scale-[0.98] blur-xl" : "opacity-100 scale-100 blur-0",
                                showLightbox && "cursor-zoom-in hover:brightness-95",
                                className
                            )}
                            onClick={() => showLightbox && !isLoading && setIsOpen(true)}
                        />

                        {/* Zoom Indicator Overlay */}
                        {showLightbox && !isLoading && (
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none">
                                <div className="p-3 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white scale-75 group-hover:scale-100 transition-transform duration-500">
                                    <Maximize2 size={18} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Lightbox / Modal */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-base-100/90 backdrop-blur-2xl p-4 md:p-12 lg:p-20"
                        onClick={() => setIsOpen(false)}
                    >
                        <motion.button
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-base-content/10 hover:bg-base-content/20 text-base-content flex items-center justify-center z-10 transition-colors shadow-premium-lg border border-base-content/10"
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                            aria-label="Close Preview"
                        >
                            <X size={24} />
                        </motion.button>

                        <motion.div
                            initial={{ scale: 0.95, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 20, opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full h-full flex items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={src}
                                alt={alt}
                                className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.2)] dark:shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-base-content/5"
                            />
                        </motion.div>

                        {/* Footer Info */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-base-content/5 border border-base-content/10 backdrop-blur-md"
                        >
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">{alt}</span>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
