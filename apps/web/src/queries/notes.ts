import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/eden'
import { queryClient } from './client'
import { deleteDraft } from '../lib/idb'

// Define keys for Notes
export const notesKeys = {
    all: ['notes'] as const,
    list: (filters: any) => [...notesKeys.all, 'list', filters] as const,
    detail: (id: string) => [...notesKeys.all, 'detail', id] as const,
    references: (filters: any) => [...notesKeys.all, 'references', filters] as const,
    quickJot: (questionId: string) => notesKeys.list({ questionId, type: 'QUESTION', limit: 1 }),
    search: (query: string) => [...notesKeys.all, 'search', query] as const,
    recent: () => [...notesKeys.all, 'recent'] as const,
}

export type Note = {
    id: string
    title: string | null
    content: any
    plain_text: string | null
    type: 'QUESTION' | 'GLOBAL'
    is_folder: boolean
    parent_id: string | null
    question_id: string | null
    created_at: string
    updated_at: string
}

export type NoteReference = {
    id: string
    source_note_id: string
    target_part: string | null
    target_anchor: string | null
    mode: 'SNAPSHOT' | 'LIVE'
    created_at: string
    notes?: {
        id: string
        title: string
        type: string
        updated_at: string
    }
}

export const useNotes = (filters: {
    questionId?: string
    parentId?: string
    type?: 'QUESTION' | 'GLOBAL'
    q?: string
    limit?: number
}) => {
    return useInfiniteQuery({
        queryKey: notesKeys.list(filters),
        queryFn: async ({ pageParam }) => {
            const { data, error } = await api.api.v1.notes.get({
                query: {
                    ...filters,
                    cursor: pageParam || undefined
                }
            })
            if (error) throw error
            return data
        },
        initialPageParam: '',
        getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    })
}

export const useSearchNotes = (query: string, limit = 10) => {
    return useQuery({
        queryKey: notesKeys.search(query),
        queryFn: async () => {
            if (!query) return { results: [] }
            const { data, error } = await api.api.v1.notes.search.get({
                query: { q: query, limit }
            })
            if (error) throw error
            return data
        },
        enabled: query.length > 0
    })
}

export const useRecentNotes = (limit = 20) => {
    return useQuery({
        queryKey: notesKeys.recent(),
        queryFn: async () => {
            const { data, error } = await api.api.v1.notes.get({
                query: { type: 'GLOBAL', limit, cursor: undefined }
            })
            if (error) throw error
            return data.items // Note: backend returns { items, nextCursor }
        }
    })
}

export const useGlobalNotes = (parentId: string | null = null, enabled = true) => {
    return useQuery({
        queryKey: notesKeys.list({ parentId, type: 'GLOBAL' }),
        queryFn: async () => {
            const { data, error } = await api.api.v1.notes.get({
                query: { parentId: parentId || undefined, type: 'GLOBAL' }
            })
            if (error) throw error
            return data.items
        },
        enabled
    })
}

export const useAllFolders = () => {
    return useQuery({
        queryKey: [...notesKeys.all, 'folders'],
        queryFn: async () => {
            const { data, error } = await api.api.v1.notes.folders.get();

            if (error) throw error;
            return data.items;
        }
    })
}

export const useNote = (id: string, enabled = true) => {
    return useQuery({
        queryKey: notesKeys.detail(id),
        queryFn: async () => {
            const { data, error } = await api.api.v1.notes({ id }).get()
            if (error) throw error
            return data
        },
        enabled: !!id && enabled
    })
}

export const useNoteReferences = (filters: {
    targetQuestionId?: string
    targetNoteId?: string
}) => {
    return useQuery({
        queryKey: notesKeys.references(filters),
        queryFn: async () => {
            const { data, error } = await api.api.v1.notes.references.get({ query: filters })
            if (error) throw error
            return data
        },
        enabled: !!(filters.targetQuestionId || filters.targetNoteId)
    })
}

export const useCreateNote = () => {
    return useMutation({
        mutationFn: async (payload: {
            type: 'QUESTION' | 'GLOBAL'
            questionId?: string
            title?: string
            content?: any
            plainText?: string
            isFolder?: boolean
            parentId?: string
        }) => {
            const { data, error } = await api.api.v1.notes.post(payload)
            if (error) throw error
            return data
        },
        onMutate: async (variables) => {
            // We only optimize for QUESTION notes in QuickJot for now
            if (variables.type !== 'QUESTION' || !variables.questionId) return

            const listKey = notesKeys.quickJot(variables.questionId)
            const tempId = 'temp-' + Date.now()

            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: listKey })

            // Snapshot the previous value
            const previousData = queryClient.getQueryData(listKey)

            // ✅ P0: Do NOT delete draft in onMutate - mark as syncing instead
            // Draft will be deleted in onSuccess only after confirmed server write
            // This protects against browser crash / network issues losing user data.

            // Optimistically update with temp item
            const tempItem: Partial<Note> = {
                id: tempId,
                title: variables.title || null,
                content: variables.content || {},
                plain_text: variables.plainText || '',
                type: variables.type,
                is_folder: variables.isFolder || false,
                parent_id: variables.parentId || null,
                question_id: variables.questionId || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }

            queryClient.setQueryData(listKey, (old: any) => {
                if (!old) {
                    return {
                        pages: [{ items: [tempItem], nextCursor: null }],
                        pageParams: [undefined]
                    }
                }

                return {
                    ...old,
                    pages: old.pages.map((page: any, idx: number) =>
                        idx === 0
                            ? { ...page, items: [tempItem, ...page.items] }
                            : page
                    )
                }
            })

            return { previousData, listKey, tempId, questionId: variables.questionId }
        },
        onSuccess: (data, variables, context) => {
            // ✅ P0: Delete draft only after server confirms write
            if (variables.questionId) {
                deleteDraft(variables.questionId).catch(console.warn)
            }

            // Update the cache with the REAL note data immediately
            if (variables.type === 'QUESTION' && variables.questionId && data && context?.tempId) {
                const listKey = notesKeys.quickJot(variables.questionId)

                queryClient.setQueryData(listKey, (old: any) => {
                    if (!old?.pages) return old
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            // ✅ P0: Find and replace by tempId, not just first item
                            items: page.items.map((item: any) =>
                                item.id === context.tempId ? data : item
                            )
                        }))
                    }
                })
            }
        },
        onError: (_err, _variables, context) => {
            // Rollback cache
            if (context?.previousData && context?.listKey) {
                queryClient.setQueryData(context.listKey, context.previousData)
            }
            // Draft was NOT deleted in onMutate, so no need to restore it
        },
        onSettled: (_data, _error, variables) => {
            if (variables.type === 'QUESTION' && variables.questionId) {
                queryClient.invalidateQueries({ queryKey: notesKeys.quickJot(variables.questionId) })
            }
            if (variables.type === 'GLOBAL') {
                // Precise invalidation for the created parent folder
                queryClient.invalidateQueries({ queryKey: notesKeys.list({ parentId: variables.parentId || null, type: 'GLOBAL' }) })
                queryClient.invalidateQueries({ queryKey: notesKeys.recent() })
            }
        }
    })
}

export const useUpdateNote = () => {
    return useMutation({
        mutationFn: async ({ id, ...payload }: {
            id: string
            title?: string
            content?: any
            plainText?: string
            refs?: any[]
            questionId?: string // For IDB tracking and cache key
            parentId?: string | null // For precise invalidation
        }) => {
            const { data, error } = await api.api.v1.notes({ id }).patch(payload);
            if (error) {
                // Handle different error formats to prevent [object Object]
                const message = (error as any)?.value?.error || (error as any)?.message || 'Update failed';
                throw new Error(message);
            }
            return data;
        },
        onMutate: async (variables) => {
            if (!variables.questionId) return

            const listKey = notesKeys.quickJot(variables.questionId)
            const detailKey = notesKeys.detail(variables.id)

            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: listKey })
            await queryClient.cancelQueries({ queryKey: detailKey })

            // Snapshot the previous value
            const previousListData = queryClient.getQueryData(listKey)
            const previousDetailData = queryClient.getQueryData(detailKey)

            // ✅ P0: Do NOT delete draft in onMutate
            // Draft will be deleted in onSuccess only

            const now = new Date().toISOString()

            // ✅ P1: Optimistically update list with explicit field mapping (no spread of variables)
            queryClient.setQueryData(listKey, (old: any) => {
                if (!old?.pages) return old
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        items: page.items.map((item: any) => {
                            if (item.id === variables.id) {
                                return {
                                    ...item,
                                    // Explicit field mapping - only Note fields
                                    ...(variables.title !== undefined && { title: variables.title }),
                                    ...(variables.content !== undefined && { content: { ...item.content, ...variables.content } }),
                                    ...(variables.plainText !== undefined && { plain_text: variables.plainText }),
                                    updated_at: now
                                }
                            }
                            return item
                        })
                    }))
                }
            })

            // Optimistically update detail with explicit field mapping
            queryClient.setQueryData(detailKey, (old: any) => {
                if (!old) return old
                return {
                    ...old,
                    ...(variables.title !== undefined && { title: variables.title }),
                    ...(variables.content !== undefined && { content: { ...old.content, ...variables.content } }),
                    ...(variables.plainText !== undefined && { plain_text: variables.plainText }),
                    updated_at: now
                }
            })

            return { previousListData, previousDetailData, listKey, detailKey, questionId: variables.questionId }
        },
        onSuccess: (_data, variables) => {
            // ✅ P0: Delete draft only after server confirms write
            if (variables.questionId) {
                deleteDraft(variables.questionId).catch(console.warn)
            }
        },
        onError: (_err, _variables, context) => {
            // Rollback cache
            if (context?.previousListData && context?.listKey) {
                queryClient.setQueryData(context.listKey, context.previousListData)
            }
            if (context?.previousDetailData && context?.detailKey) {
                queryClient.setQueryData(context.detailKey, context.previousDetailData)
            }
            // Draft was NOT deleted, so no need to restore it
        },
        onSettled: (_data, _error, variables) => {
            // ✅ P1: Only invalidate specific keys
            if (variables.questionId) {
                queryClient.invalidateQueries({ queryKey: notesKeys.quickJot(variables.questionId) })
            } else if (variables.parentId !== undefined) {
                // Invalidate the specific folder this note belongs to if provided
                queryClient.invalidateQueries({ queryKey: notesKeys.list({ parentId: variables.parentId, type: 'GLOBAL' }) })
            } else {
                // Fallback if parentId is unknown - but we should avoid full invalidations
                queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
            }
            queryClient.invalidateQueries({ queryKey: notesKeys.detail(variables.id) })
        }
    })
}

export const useMoveNote = () => {
    return useMutation({
        mutationFn: async ({ id, parentId }: { id: string, parentId: string | null }) => {
            const { data, error } = await api.api.v1.notes({ id }).move.patch({ parentId })
            if (error) throw error
            return data
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
            queryClient.invalidateQueries({ queryKey: notesKeys.detail(variables.id) })
        }
    })
}

export const useDeleteNote = () => {
    return useMutation({
        mutationFn: async ({ id }: { id: string, parentId?: string | null }) => {
            const { data, error } = await api.api.v1.notes({ id }).delete()
            if (error) throw error
            return data
        },
        onSuccess: (_data, variables) => {
            if (variables.parentId !== undefined) {
                queryClient.invalidateQueries({ queryKey: notesKeys.list({ parentId: variables.parentId, type: 'GLOBAL' }) })
            } else {
                queryClient.invalidateQueries({ queryKey: ['notes', 'list'] })
            }
            queryClient.invalidateQueries({ queryKey: notesKeys.recent() })
        }
    })
}
