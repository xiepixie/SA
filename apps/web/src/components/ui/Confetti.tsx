import React, { useEffect, useState } from 'react';

interface ConfettiPiece {
    id: number;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    color: string;
    delay: number;
}

interface ConfettiProps {
    trigger: boolean;
    duration?: number;
    particleCount?: number;
}

const COLORS = [
    'hsl(var(--p))',      // primary
    'hsl(var(--s))',      // secondary
    'hsl(var(--a))',      // accent
    'hsl(var(--su))',     // success
    '#FFD700',            // gold
    '#FF69B4',            // pink
];

/**
 * Confetti - Celebratory confetti animation for successful actions
 * Triggers when `trigger` becomes true
 */
export const Confetti: React.FC<ConfettiProps> = ({
    trigger,
    duration = 3000,
    particleCount = 50
}) => {
    const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        if (!trigger) return;

        // Generate confetti pieces
        const newPieces: ConfettiPiece[] = Array.from({ length: particleCount }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: -10 - Math.random() * 20,
            rotation: Math.random() * 360,
            scale: 0.5 + Math.random() * 0.5,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            delay: Math.random() * 0.5,
        }));

        setPieces(newPieces);
        setIsActive(true);

        const timer = setTimeout(() => {
            setIsActive(false);
            setPieces([]);
        }, duration);

        return () => clearTimeout(timer);
    }, [trigger, duration, particleCount]);

    if (!isActive || pieces.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
            {pieces.map((piece) => (
                <div
                    key={piece.id}
                    className="absolute animate-confetti-fall"
                    style={{
                        left: `${piece.x}%`,
                        top: `${piece.y}%`,
                        '--confetti-delay': `${piece.delay}s`,
                        '--confetti-rotation': `${piece.rotation}deg`,
                        animationDelay: `${piece.delay}s`,
                    } as React.CSSProperties}
                >
                    <div
                        className="w-3 h-3 rounded-sm animate-confetti-spin"
                        style={{
                            backgroundColor: piece.color,
                            transform: `scale(${piece.scale}) rotate(${piece.rotation}deg)`,
                        }}
                    />
                </div>
            ))}
        </div>
    );
};

export default Confetti;
