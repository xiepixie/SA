import type { ImportItem, ImportConfig, ImportPipelineResult } from '@v2/shared'
import { supabase } from '../lib/supabase'

/**
 * 运行导入流水线：解析引用 -> 插入题目 -> 建立标签关联 -> 创建复习卡片
 */
export async function runImportPipeline(params: {
    userId: string;
    items: ImportItem[];
    config?: ImportConfig;
}): Promise<ImportPipelineResult> {
    const { userId, items, config } = params;
    const importBatchId = config?.importBatchId || crypto.randomUUID();

    try {
        // 1. Resolve Subjects & Tags (填充 items 中的 resolved 字段)
        const resolutionErrors = await resolveReferences(userId, items, config);

        // 2. Insert Questions
        const inserted = await insertQuestions(userId, items, importBatchId);

        // 合并错误
        const allRowErrors = [...resolutionErrors, ...inserted.rowErrors];

        // 3. Create Tag Associations
        const tagAssoc = await createTagAssociations(items, inserted.rowToQuestionId);

        // 4. Create Cards
        let cardsResult = undefined;
        if (config?.create_cards && inserted.insertedIds.length > 0) {
            cardsResult = await createCards(userId, Object.values(inserted.rowToQuestionId), config);
        }

        // 5. Emit Signals (notify client to revalidate views) using upsert to avoid duplicate key errors
        try {
            const signals = [
                { topic: 'question_list', op: 'REFRESH', user_id: userId, entity_key: 'general' },
                { topic: 'asset', op: 'REFRESH', user_id: userId, entity_key: 'general' }
            ];
            if (config?.create_cards) {
                signals.push({ topic: 'due_list', op: 'REFRESH', user_id: userId, entity_key: 'general' });
            }
            await supabase.from('realtime_signals').upsert(signals, { onConflict: 'user_id,topic,entity_key' });
        } catch (signalError) {
            console.warn('⚠️ [ImportPipeline] Failed to emit refresh signals:', signalError);
        }

        return {
            success: inserted.success,
            failed: inserted.failed + (resolutionErrors.length > 0 && inserted.success === 0 ? items.length : 0),
            rowErrors: allRowErrors,
            insertedIds: inserted.insertedIds,
            importBatchId,
            tagAssoc,
            cards: cardsResult
        };
    } catch (criticalError: any) {
        console.error('🔥 [ImportPipeline] Critical failure:', criticalError);
        return {
            success: 0,
            failed: items.length,
            rowErrors: [{ row: 0, error: `Critical Pipeline Error: ${criticalError.message}` }],
            insertedIds: [],
            importBatchId,
        };
    }
}

/**
 * 批量解析或创建学科和标签
 * 返回产生的错误详情
 */
async function resolveReferences(userId: string, items: ImportItem[], config?: ImportConfig) {
    const subjectNames = Array.from(new Set(items.map(it => it.subject_name).filter(Boolean) as string[]));
    const tagNames = Array.from(new Set(items.flatMap(it => it.tag_names || []).filter(Boolean)));
    const resolutionErrors: { row: number, error: string }[] = [];

    // --- Batch resolve subjects ---
    const subjectMap: Record<string, string> = {};
    if (subjectNames.length > 0) {
        const { data: existingSubjects, error: sError } = await supabase
            .from('subjects')
            .select('id, name, user_id')
            .in('name', subjectNames)
            .or(`user_id.is.null,user_id.eq.${userId}`)
            .is('deleted_at', null);

        if (sError) {
            console.error('Failed to fetch existing subjects:', sError);
            resolutionErrors.push({ row: 0, error: `Subject lookup failed: ${sError.message}` });
        }

        for (const s of (existingSubjects as any[]) || []) {
            // 优先使用用户的私有学科
            if (s.user_id === userId || !subjectMap[s.name]) {
                subjectMap[s.name] = s.id;
            }
        }

        const missingSubjects = subjectNames.filter(n => !subjectMap[n]);
        if (missingSubjects.length > 0) {
            // Use insert instead of upsert because the unique index on (user_id, name) is partial (WHERE deleted_at IS NULL),
            // which PostgREST's upsert doesn't support well without explicit constraint targets.
            const { data: newSubjects, error: iError } = await supabase
                .from('subjects')
                .insert(missingSubjects.map(name => ({ name, user_id: userId })))
                .select('id, name');

            if (iError) {
                console.warn('⚠️ [ImportService] Batch subject insert failed, attempting fallback resolution:', iError.message);
                // Fallback: re-fetch missing subjects (they might have been created by another process)
                const { data: finalSubjects, error: fError } = await supabase
                    .from('subjects')
                    .select('id, name')
                    .in('name', missingSubjects)
                    .eq('user_id', userId)
                    .is('deleted_at', null);

                if (fError) {
                    resolutionErrors.push({ row: 0, error: `Critical: Failed to resolve subjects (${fError.message})` });
                } else {
                    for (const s of finalSubjects || []) {
                        subjectMap[s.name] = s.id;
                    }
                }
            } else {
                for (const s of newSubjects || []) {
                    subjectMap[s.name] = s.id;
                }
            }
        }
    }

    // --- Batch resolve tags ---
    const tagMap: Record<string, string> = {};
    if (tagNames.length > 0) {
        const { data: existingTags, error: tError } = await supabase
            .from('tags')
            .select('id, name, user_id')
            .in('name', tagNames)
            .or(`user_id.is.null,user_id.eq.${userId}`)
            .is('deleted_at', null);

        if (tError) {
            console.error('Failed to fetch existing tags:', tError);
            resolutionErrors.push({ row: 0, error: `Tag lookup failed: ${tError.message}` });
        }

        for (const t of (existingTags as any[]) || []) {
            if (t.user_id === userId || !tagMap[t.name]) {
                tagMap[t.name] = t.id;
            }
        }

        const missingTags = tagNames.filter(n => !tagMap[n]);
        if (missingTags.length > 0) {
            // Use insert instead of upsert for the same reason as subjects
            const { data: newTags, error: iError } = await supabase
                .from('tags')
                .insert(missingTags.map(name => ({ name, user_id: userId })))
                .select('id, name');

            if (iError) {
                console.warn('⚠️ [ImportService] Batch tag insert failed, attempting fallback resolution:', iError.message);
                const { data: finalTags, error: fError } = await supabase
                    .from('tags')
                    .select('id, name')
                    .in('name', missingTags)
                    .eq('user_id', userId)
                    .is('deleted_at', null);

                if (fError) {
                    resolutionErrors.push({ row: 0, error: `Critical: Failed to resolve tags (${fError.message})` });
                } else {
                    for (const t of finalTags || []) {
                        tagMap[t.name] = t.id;
                    }
                }
            } else {
                for (const t of newTags || []) {
                    tagMap[t.name] = t.id;
                }
            }
        }
    }

    // --- Update items with resolved IDs ---
    for (const it of items) {
        const sid = it.question.subject_id || (it.subject_name ? subjectMap[it.subject_name] : config?.defaultSubjectId);
        const tids = [
            ...(config?.defaultTagIds || []),
            ...(it.tag_names || []).map(n => tagMap[n]).filter(Boolean)
        ];

        it.resolved = {
            subject_id: sid || undefined,
            tag_ids: Array.from(new Set(tids)) as string[]
        };
        // 同时同步回 question 字段，确保插入时有值
        it.question.subject_id = sid || undefined;
    }

    return resolutionErrors;
}

/**
 * 插入题目数据
 */
async function insertQuestions(userId: string, items: ImportItem[], batchId: string) {
    const insertedIds: string[] = [];
    const rowErrors: { row: number, error: string }[] = [];
    const rowToQuestionId: Record<number, string> = {};
    let successCount = 0;
    let failedCount = 0;

    const payloads = items.map(it => ({
        user_id: userId,
        title: it.question.title,
        content: it.question.content,
        question_type: it.question.question_type,
        difficulty: it.question.difficulty,
        explanation: it.question.explanation,
        correct_answer: it.question.correct_answer || {}, // DB NOT NULL
        correct_answer_text: it.question.correct_answer_text,
        hints: it.question.hints || {},
        metadata: {
            ...it.question.metadata,
            __import: { batch_id: batchId, row: it.__row, at: new Date().toISOString() }
        },
        image_url: it.question.image_url,
        explanation_image_url: it.question.explanation_image_url,
        correct_answer_image_url: it.question.correct_answer_image_url,
        subject_id: it.question.subject_id || null
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
        const chunk = payloads.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
            .from('error_questions')
            .insert(chunk)
            .select('id, metadata');

        if (error) {
            // Batch failed, isolate errors
            for (const p of chunk) {
                const { data: singleData, error: singleError } = await supabase
                    .from('error_questions')
                    .insert(p)
                    .select('id, metadata')
                    .single();

                if (singleError) {
                    failedCount++;
                    rowErrors.push({ row: (p.metadata as any).__import.row, error: singleError.message });
                } else {
                    successCount++;
                    insertedIds.push(singleData.id);
                    rowToQuestionId[(singleData.metadata as any).__import.row] = singleData.id;
                }
            }
        } else if (data) {
            successCount += data.length;
            for (const r of data) {
                insertedIds.push(r.id);
                rowToQuestionId[(r.metadata as any).__import.row] = r.id;
            }
        }
    }

    return { success: successCount, failed: failedCount, rowErrors, insertedIds, rowToQuestionId };
}

/**
 * 创建标签关联
 */
async function createTagAssociations(items: ImportItem[], rowToQuestionId: Record<number, string>) {
    const associations: { question_id: string, tag_id: string }[] = [];
    for (const it of items) {
        const qid = rowToQuestionId[it.__row];
        const tids = it.resolved?.tag_ids;
        if (qid && tids) {
            for (const tid of tids) {
                associations.push({ question_id: qid, tag_id: tid });
            }
        }
    }

    if (associations.length === 0) return { success: 0, failed: 0 };

    // 采用 ignoreDuplicates 以防万一
    const { error } = await supabase
        .from('error_question_tags')
        .upsert(associations, { onConflict: 'question_id,tag_id', ignoreDuplicates: true });

    if (error) {
        console.error('❌ Failed to associate tags:', error);
        return { success: 0, failed: associations.length };
    }

    return { success: associations.length, failed: 0 };
}

/**
 * 批量为题目创建对应的学习卡片
 */
async function createCards(userId: string, questionIds: string[], config: ImportConfig) {
    const now = new Date();
    const calculateDue = (index: number, total: number): Date => {
        const base = config.cards_due_start ? new Date(config.cards_due_start) : now;
        switch (config.cards_due_spread) {
            case 'spread_1d':
                return new Date(base.getTime() + (index / total) * 24 * 60 * 60 * 1000);
            case 'spread_7d':
                return new Date(base.getTime() + (index / total) * 7 * 24 * 60 * 60 * 1000);
            default:
                return base;
        }
    };

    const payloads = questionIds.map((qid, idx) => ({
        user_id: userId,
        question_id: qid,
        state: 0,
        due: calculateDue(idx, questionIds.length).toISOString()
    }));

    let totalCreated = 0;
    const CARD_BATCH_SIZE = 100;
    const cardIds: string[] = [];

    for (let i = 0; i < payloads.length; i += CARD_BATCH_SIZE) {
        const chunk = payloads.slice(i, i + CARD_BATCH_SIZE);
        const { data, error } = await supabase
            .from('cards')
            .insert(chunk)
            .select('id');

        if (error) {
            console.error('❌ Batch card creation failed:', error);
            // 尝试单条插入以隔离错误
            for (const singleCard of chunk) {
                const { data: sData, error: sError } = await supabase
                    .from('cards')
                    .insert(singleCard)
                    .select('id')
                    .single();

                if (sError) {
                    console.error('❌ Single card creation failed:', sError);
                } else if (sData) {
                    totalCreated++;
                    cardIds.push(sData.id);
                }
            }
        } else if (data) {
            totalCreated += data.length;
            cardIds.push(...data.map(c => c.id));
        }
    }

    return {
        success: totalCreated,
        failed: payloads.length - totalCreated,
        cardIds
    };
}
