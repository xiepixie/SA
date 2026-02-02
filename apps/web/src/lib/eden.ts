import { treaty } from '@elysiajs/eden'
import type { App } from '@v2/server'
import { supabase, getSessionPersistence } from './supabase'

/**
 * 动态解析 API URL：
 * - 开发环境：使用当前页面的 origin (e.g., http://localhost:5173)，通过 Vite 代理转发
 * - 生产环境：使用 VITE_API_URL 环境变量
 */
const getApiUrl = () => {
    if (import.meta.env.DEV) {
        return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    }
    return import.meta.env.VITE_API_URL || ''
}

/**
 * 从 storage 直接获取 Supabase Access Token，并验证有效性
 * 根据用户的"记住我"偏好选择检查 localStorage 或 sessionStorage
 */
const getAccessToken = (): string | null => {
    if (typeof window === 'undefined') return null

    try {
        // Determine which storage to check first based on persistence preference
        const isPersistent = getSessionPersistence()
        const primaryStorage = isPersistent ? localStorage : sessionStorage
        const secondaryStorage = isPersistent ? sessionStorage : localStorage

        // Helper to extract token from storage
        const extractToken = (storage: Storage): string | null => {
            const keys = Object.keys(storage)
            const authKey = keys.find(k => k.includes('-auth-token') && k.startsWith('sb-'))

            if (authKey) {
                const raw = storage.getItem(authKey)
                if (raw) {
                    const data = JSON.parse(raw)
                    const token = data.access_token
                    const expiresAt = data.expires_at // Unix timestamp (seconds)

                    // Return token if valid and not expired (with 60s buffer)
                    if (token && expiresAt && (expiresAt > (Date.now() / 1000) + 60)) {
                        return token
                    }
                }
            }
            return null
        }

        // Try primary storage first, then fallback to secondary
        return extractToken(primaryStorage) || extractToken(secondaryStorage)
    } catch (e) {
        console.warn('[Eden] Failed to parse token from storage:', e)
    }

    return null
}

/**
 * Smart Error Archiver API Client (Eden Treaty 2)
 * 自动注入 Supabase 会话令牌以支持后端鉴权
 * 开发环境通过 Vite 代理 (/api -> localhost:3001)
 */
export const api = treaty<App>(getApiUrl(), {
    onRequest: async (_path, options) => {
        // 优先从 localStorage 直接获取 token（更可靠）
        let token = getAccessToken()

        // 如果 localStorage 没有，尝试从 Supabase SDK 获取
        if (!token) {
            const { data: { session } } = await supabase.auth.getSession()
            token = session?.access_token || null
        }

        if (token) {
            return {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${token}`
                }
            }
        }
        return options
    }
})
