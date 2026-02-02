import { useEffect } from 'react'
import { useAppStore } from './useAppStore'
import type { UXEffect } from '@v2/shared'

/**
 * useAppEffects: Consumes UX effects from the global store
 */
export function useAppEffects(handler: (effect: UXEffect) => void) {
    const popEffect = useAppStore(s => s.popEffect)

    useEffect(() => {
        const interval = setInterval(() => {
            const eff = popEffect()
            if (eff) {
                handler(eff)
            }
        }, 100) // Poll for effects every 100ms

        return () => clearInterval(interval)
    }, [popEffect, handler])
}
