import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/eden'
import { queryClient } from './client'
import { deleteDraft, saveDraft } from '../lib/idb'

// Define keys for Notes
export const notesKeys = {
    all: ['notes'] as const,
    list: (filters: any) => [...notesKeys.all, 'list', filters] as const,
    detail: (id: string) => [...notesKeys.all, 'detail', id] as const,
    references: (filters: any) => [...notesKeys.all, 'references', filters] as const,
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
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: notesKeys.all })

            // Snapshot the previous value
            const previousData = queryClient.getQueryData(notesKeys.all)

            // Clear IDB draft optimistically (will be restored on error)
            let draftCleared = false
            if (variables.questionId) {
                try {
                    await deleteDraft(variables.questionId)
                    draftCleared = true
                } catch (e) {
                    console.warn('Failed to clear draft:', e)
                }
            }

            // If we are creating a QUESTION note, we can optimistically add it to the list
            if (variables.type === 'QUESTION' && variables.questionId) {
                const listFilters = { questionId: variables.questionId, type: 'QUESTION', limit: 1 }
                const listKey = notesKeys.list(listFilters)

                queryClient.setQueryData(listKey, (old: any) => {
                    const newItem = {
                        id: 'temp-' + Date.now(),
                        ...variables,
                        plain_text: variables.plainText || '',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                    if (!old) return { pages: [{ items: [newItem], nextCursor: null }], pageParams: [''] }
                    return {
                        ...old,
                        pages: old.pages.map((page: any, idx: number) =>
                            idx === 0 ? { ...page, items: [newItem, ...page.items] } : page
                        )
                    }
                })
            }

            return { previousData, draftCleared, questionId: variables.questionId, content: variables.content?.markdown }
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(notesKeys.all, context.previousData)
            }
            // Restore draft on error
            if (context?.draftCleared && context?.questionId && context?.content) {
                saveDraft({
                    id: context.questionId,
                    content: context.content,
                    updatedAt: Date.now(),
                    syncedAt: null,
                }).catch(console.warn)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.all })
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
            questionId?: string // Added for IDB tracking
        }) => {
            const { data, error } = await api.api.v1.notes({ id }).patch(payload)
            if (error) throw error
            return data
        },
        onMutate: async (variables) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: notesKeys.all })

            // Snapshot the previous value
            const previousData = queryClient.getQueryData(notesKeys.all)

            // Clear IDB draft optimistically
            let draftCleared = false
            if (variables.questionId) {
                try {
                    await deleteDraft(variables.questionId)
                    draftCleared = true
                } catch (e) {
                    console.warn('Failed to clear draft:', e)
                }
            }

            // Optimistically update the detail query if it exists
            queryClient.setQueryData(notesKeys.detail(variables.id), (old: any) => ({
                ...old,
                ...variables,
                updated_at: new Date().toISOString()
            }))

            // Optimistically update the list queries (handle infinite query structure)
            queryClient.setQueriesData({ queryKey: notesKeys.all }, (old: any) => {
                if (!old || !old.pages) return old
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        items: page.items.map((item: any) =>
                            item.id === variables.id ? { ...item, ...variables, updated_at: new Date().toISOString() } : item
                        )
                    }))
                }
            })

            return { previousData, draftCleared, questionId: variables.questionId, content: variables.content?.markdown }
        },
        onError: (_err, _variables, context) => {
            // Rollback on error
            if (context?.previousData) {
                queryClient.setQueryData(notesKeys.all, context.previousData)
            }
            // Restore draft on error
            if (context?.draftCleared && context?.questionId && context?.content) {
                saveDraft({
                    id: context.questionId,
                    content: context.content,
                    updatedAt: Date.now(),
                    syncedAt: null,
                }).catch(console.warn)
            }
        },
        onSettled: (_data, _error, variables) => {
            queryClient.invalidateQueries({ queryKey: notesKeys.detail(variables.id) })
            queryClient.invalidateQueries({ queryKey: notesKeys.all })
        }
    })
}

export const useDeleteNote = () => {
    return useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await api.api.v1.notes({ id }).delete()
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: notesKeys.all })
        }
    })
}
