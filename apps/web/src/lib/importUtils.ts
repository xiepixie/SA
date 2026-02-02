/**
 * Smart Error Archiver - Import Utilities (V3.2, Schema V5.9 aligned)
 *
 * ✅ JSON/CSV parse (File supported for CSV via PapaParse worker)
 * ✅ Strict whitelist + system-field stripping (anti-injection)
 * ✅ Normalization aligned with validate_correct_answer trigger
 * ✅ Row-level issues (error/warning) with __row for UI定位
 * ✅ Subject/Tag resolving (batch, minimal queries, safe with partial unique indexes)
 * ✅ Bulk insert + bisect bad rows; stable row->id mapping via metadata.__import.row
 * ✅ Optional: bulk tag associations + card creation
 * ✅ UUID/URL field validation
 * ✅ SSR-compatible timing (nowMs fallback)
 *
 * @see v2/docs/import-design.md
 * @see v2/supabase/schema_full.sql
 */

import { type ImportItem, type QuestionType, type Difficulty } from '@v2/shared';

export type ImportErrorCode =
    | 'MISSING_REQUIRED_FIELD'
    | 'INVALID_ENUM_VALUE'
    | 'TYPE_MISMATCH'
    | 'TYPE_INVALID'
    | 'INVALID_STRUCTURE'
    | 'INVALID_JSON'
    | 'INVALID_CHOICE_IDS'
    | 'DUPLICATE_ANSWERS'
    | 'DUPLICATE_CHOICE_IDS'
    | 'NON_STRING_ANSWER'
    | 'INVALID_UUID'
    | 'INVALID_URL'
    | 'UNSUPPORTED_FORMAT'
    | 'DB_INSERT_FAILED';

/**
 * 校验问题 - 支持 error/warning 分离
 */
export interface ValidationIssue {
    level: 'error' | 'warning';
    row: number;        // 1-indexed, 0 = 全局错误
    field: string;
    message: string;
    value?: unknown;
    code?: ImportErrorCode;
}

/** 兼容旧 API */
export type ValidationError = ValidationIssue;

export type CorrectAnswer =
    | { type: 'choice'; choice_ids?: string[]; choice_id?: string }
    | { type: 'fill_blank'; blanks: string[] }
    | { type: 'short_answer'; answers: string[] }
    | Record<string, unknown>;

export interface Hints {
    choices?: Array<{ id: string; text: string }>;
    optionAnalysis?: Record<string, { why: string }>;
    hints?: string[];
    [key: string]: unknown;
}

/** 白名单字段 */
export const ALLOWED_QUESTION_FIELDS = [
    'title', 'content', 'question_type', 'difficulty', 'explanation',
    'correct_answer', 'correct_answer_text', 'hints', 'metadata',
    'image_url', 'explanation_image_url', 'correct_answer_image_url',
    'subject_id', 'tag_names', 'subject_name'
] as const;

export type AllowedField = (typeof ALLOWED_QUESTION_FIELDS)[number];

/** 系统保留字段 - 用户输入会被过滤 */
const SYSTEM_RESERVED_FIELDS = new Set([
    'id', 'user_id', 'created_at', 'updated_at',
    'content_hash', 'last_synced_hash', 'forked_from', 'is_archived'
]);

/** 双轨模式阈值 */
export const QUEUE_THRESHOLD = 50;

import { supabase } from './supabase';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';

/**
 * 解析阶段的"行级产物"：保留 __row 用于错误追踪
 */
// Exported from @v2/shared

export interface ParseResult {
    items: ImportItem[];
    issues: ValidationIssue[];
    stats: {
        parseTimeMs: number;
        totalRows: number;
        validCount: number;
        errorCount: number;
        warningCount: number;
    };
}

/** 兼容旧 API - ParsedQuestion */
export interface ParsedQuestion {
    title: string;
    question_type: QuestionType;
    correct_answer: CorrectAnswer;
    content?: string;
    difficulty?: Difficulty;
    explanation?: string;
    correct_answer_text?: string;
    hints?: Hints;
    metadata?: Record<string, unknown>;
    image_url?: string;
    explanation_image_url?: string;
    correct_answer_image_url?: string;
    subject_id?: string;
    tag_names?: string[];
    subject_name?: string;
    __row?: number;
}

export interface ImportConfig {
    defaultSubjectId?: string;
    defaultTagIds?: string[];
    create_cards?: boolean;
    cards_due_start?: Date;
    cards_due_spread?: 'immediate' | 'spread_1d' | 'spread_7d';
    importBatchId?: string;
}

export interface BatchInsertProgress {
    phase: 'inserting' | 'bisecting' | 'done';
    current: number;
    total: number;
    success: number;
    failed: number;
}

export interface BatchInsertResult {
    success: number;
    failed: number;
    rowErrors: Array<{ row: number; error: string }>;
    insertedIds: string[];
    rowToQuestionId: Record<number, string>;
    importBatchId: string;
}

// ============================================
// Constants
// ============================================

const ALLOWED_QUESTION_TYPES: QuestionType[] = ['choice', 'fill_blank', 'short_answer'];
const ALLOWED_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// ============================================
// Utility Functions
// ============================================

/** SSR-compatible high-resolution timer */
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === 'object' && !Array.isArray(x);
}

function isEmptyPlainObject(x: unknown): boolean {
    return isPlainObject(x) && Object.keys(x).length === 0;
}

function toStr(x: unknown): string | undefined {
    if (x === null || x === undefined) return undefined;
    const s = String(x).trim();
    return s.length ? s : undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    const v = toStr(value)?.toLowerCase() as T | undefined;
    return (v && (allowed as readonly string[]).includes(v)) ? v : fallback;
}

/** crypto.randomUUID 需要 HTTPS/安全上下文，做个 fallback */
export function safeUUID(): string {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
    // fallback: RFC4122 v4 using getRandomValues; if absent, Math.random (non-crypto)
    const bytes = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uniq<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

function splitTokens(s: string, seps = /[;,、\n]+/g): string[] {
    return s.split(seps).map(t => t.trim()).filter(Boolean);
}

/** Validate UUID format (v1-v5) */
function isUuidLike(x: unknown): boolean {
    const s = toStr(x);
    if (!s) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Validate URL format (http/https only) */
function isLikelyUrl(x: unknown): boolean {
    const s = toStr(x);
    if (!s) return true; // empty ok
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/** Format PostgrestError for user display */
function formatPgError(err: unknown): string {
    const e = err as Partial<PostgrestError> & { details?: string; hint?: string; code?: string };
    const parts = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean);
    return parts.join(' | ') || 'Unknown error';
}

// ============================================
// Sanitizers & Normalizers
// ============================================

/**
 * 仅保留白名单字段，剔除系统字段 (防注入)
 */
export function sanitizeRawQuestion(raw: unknown): Partial<Record<AllowedField, unknown>> {
    const out: Partial<Record<AllowedField, unknown>> = {};
    if (!isPlainObject(raw)) return out;

    for (const f of ALLOWED_QUESTION_FIELDS) {
        if (f in raw && raw[f] !== undefined) {
            (out as Record<string, unknown>)[f] = raw[f];
        }
    }

    // 二次过滤系统字段
    for (const rf of SYSTEM_RESERVED_FIELDS) {
        if (rf in out) delete (out as Record<string, unknown>)[rf];
    }

    return out;
}

/**
 * 规范化问题数据 (不写 DB，准备校验/预览)
 */
export function normalizeQuestion(raw: unknown, row: number): { item: ImportItem; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    const rawObj = isPlainObject(raw) ? raw : {};
    const cleaned = sanitizeRawQuestion(rawObj);

    // 基础字段
    const title = toStr(cleaned.title) ?? '';
    const question_type = normalizeEnum<QuestionType>(cleaned.question_type, ALLOWED_QUESTION_TYPES, 'choice');
    const difficulty = normalizeEnum<Difficulty>(cleaned.difficulty, ALLOWED_DIFFICULTIES, 'medium');

    // [V3.2] subject_id UUID 校验
    if (cleaned.subject_id !== undefined && cleaned.subject_id !== null) {
        if (!isUuidLike(cleaned.subject_id)) {
            issues.push({
                level: 'error', row, field: 'subject_id',
                message: 'subject_id 必须是有效的 UUID 格式',
                value: cleaned.subject_id, code: 'INVALID_UUID'
            });
            delete (cleaned as Record<string, unknown>).subject_id;
        }
    }

    // [V3.2] URL 字段校验 (http/https only)
    for (const k of ['image_url', 'explanation_image_url', 'correct_answer_image_url'] as const) {
        if (cleaned[k] !== undefined && !isLikelyUrl(cleaned[k])) {
            issues.push({
                level: 'error', row, field: k,
                message: `${k} 不是合法 URL (仅允许 http/https)`,
                value: cleaned[k], code: 'INVALID_URL'
            });
            delete (cleaned as Record<string, unknown>)[k];
        }
    }

    // metadata 预处理 (支持从 CSV 字符串恢复对象)
    let metadata = cleaned.metadata;
    if (typeof metadata === 'string' && metadata.trim().startsWith('{')) {
        try {
            metadata = JSON.parse(metadata);
        } catch { /* ignore */ }
    }
    if (metadata !== undefined && !isPlainObject(metadata)) {
        issues.push({
            level: 'error', row, field: 'metadata',
            message: 'metadata 必须是 JSON 对象',
            value: metadata, code: 'INVALID_STRUCTURE'
        });
        metadata = undefined;
    }

    // hints 容错 - 允许对象(包含 choices/hints 等) 或 直接是字符串数组 或 JSON 字符串
    let hints = cleaned.hints;
    if (typeof hints === 'string' && hints.trim().startsWith('{')) {
        try {
            hints = JSON.parse(hints);
        } catch { /* fallback */ }
    }
    if (hints !== undefined && !isPlainObject(hints) && !Array.isArray(hints)) {
        issues.push({
            level: 'error', row, field: 'hints',
            message: 'hints 必须是 JSON 对象或字符串数组',
            value: hints, code: 'INVALID_STRUCTURE'
        });
        hints = undefined;
    }

    // correct_answer 规范化
    let correct_answer = cleaned.correct_answer;
    if (typeof correct_answer === 'string' && correct_answer.trim().startsWith('{')) {
        try {
            correct_answer = JSON.parse(correct_answer);
        } catch { /* fallback */ }
    }
    if (correct_answer === undefined || correct_answer === null) correct_answer = {};
    if (!isPlainObject(correct_answer)) {
        issues.push({
            level: 'error', row, field: 'correct_answer',
            message: 'correct_answer 必须是 JSON 对象',
            value: correct_answer, code: 'INVALID_STRUCTURE'
        });
        correct_answer = {};
    }

    // CSV 弱结构自动补全: fill_blank/short_answer 从 correct_answer_text 生成
    const correct_answer_text = toStr(cleaned.correct_answer_text);
    if (isEmptyPlainObject(correct_answer) && correct_answer_text) {
        if (question_type === 'fill_blank' || question_type === 'short_answer') {
            const arr = splitTokens(correct_answer_text);
            if (arr.length > 0) {
                if (question_type === 'fill_blank') {
                    correct_answer = { type: 'fill_blank', blanks: arr };
                } else {
                    correct_answer = { type: 'short_answer', answers: arr };
                }
                issues.push({
                    level: 'warning', row, field: 'correct_answer',
                    message: `已从 correct_answer_text 自动生成 ${question_type} 的 correct_answer`
                });
            }
        }
    }

    // [V3.2] correct_answer.type 自动补全 (非空时)
    if (!isEmptyPlainObject(correct_answer) && !toStr((correct_answer as Record<string, unknown>).type)) {
        (correct_answer as Record<string, unknown>).type = question_type;
        issues.push({
            level: 'warning', row, field: 'correct_answer.type',
            message: `correct_answer 缺少 type 字段，已自动补为 "${question_type}"`
        });
    }

    // hints.choices 规范化 (支持数组和键值对对象)
    if (isPlainObject(hints) && (hints as Hints).choices) {
        const hintsObj = hints as Hints;
        const normalizedChoices: Array<{ id: string; text: string }> = [];

        if (Array.isArray(hintsObj.choices)) {
            const seen = new Set<string>();
            for (let i = 0; i < hintsObj.choices.length; i++) {
                const c = hintsObj.choices[i];
                const id = toStr(c?.id) ?? '';
                const text = toStr(c?.text) ?? '';

                if (!id || !text) {
                    issues.push({
                        level: 'error', row, field: `hints.choices[${i}]`,
                        message: '选择题的每个选项必须包含 id 和 text',
                        value: c, code: 'INVALID_STRUCTURE'
                    });
                    continue;
                }
                if (seen.has(id)) {
                    issues.push({
                        level: 'error', row, field: `hints.choices[${i}].id`,
                        message: `选项 id 重复: ${id}`,
                        value: id, code: 'DUPLICATE_CHOICE_IDS'
                    });
                    continue;
                }
                seen.add(id);
                normalizedChoices.push({ id, text });
            }
        } else if (isPlainObject(hintsObj.choices)) {
            // 支持 {"A": "文本"} 这种简化 Record 格式
            for (const [id, text] of Object.entries(hintsObj.choices)) {
                normalizedChoices.push({ id, text: String(text) });
            }
            if (normalizedChoices.length > 0) {
                issues.push({
                    level: 'warning', row, field: 'hints.choices',
                    message: '已将对象格式的选项自动转换为标准数组格式'
                });
            }
        }

        if (normalizedChoices.length > 0) {
            hints = { ...hintsObj, choices: normalizedChoices };
        }
    }

    // 构建 item
    const question: ImportItem['question'] = {
        title,
        question_type,
        difficulty,
        correct_answer: correct_answer as any,
        content: toStr(cleaned.content),
        explanation: toStr(cleaned.explanation),
        correct_answer_text: toStr(cleaned.correct_answer_text),
        image_url: toStr(cleaned.image_url),
        explanation_image_url: toStr(cleaned.explanation_image_url),
        correct_answer_image_url: toStr(cleaned.correct_answer_image_url),
        subject_id: toStr(cleaned.subject_id),
        hints: hints as any,
    };

    // 精简 payload
    if (!isPlainObject(question.hints) || Object.keys(question.hints as object).length === 0) {
        delete question.hints;
    }

    if (isPlainObject(metadata) && Object.keys(metadata as object).length > 0) {
        question.metadata = metadata;
    } else {
        delete question.metadata;
    }

    if (!correct_answer_text) delete question.correct_answer_text;

    const item: ImportItem = {
        __row: row,
        question,
        subject_name: toStr(rawObj?.subject_name) ?? toStr(rawObj?._subject_name),
        tag_names: Array.isArray(rawObj?.tag_names)
            ? (rawObj.tag_names as unknown[]).map(t => String(t).trim()).filter(Boolean)
            : (toStr(rawObj?.tag_names) ? splitTokens(String(rawObj.tag_names)) : undefined),
    };

    return { item, issues };
}

// ============================================
// Validation - 与 validate_correct_answer() 触发器对齐
// ============================================

export function validateItem(item: ImportItem): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const row = item.__row;
    const q = item.question;

    // 1) title required
    if (!q.title?.trim()) {
        issues.push({
            level: 'error', row, field: 'title',
            message: '标题不能为空',
            code: 'MISSING_REQUIRED_FIELD'
        });
    }

    // 2) enums 校验
    if (!ALLOWED_QUESTION_TYPES.includes(q.question_type)) {
        issues.push({
            level: 'error', row, field: 'question_type',
            message: `无效题型: ${q.question_type}`,
            value: q.question_type, code: 'INVALID_ENUM_VALUE'
        });
    }

    if (!ALLOWED_DIFFICULTIES.includes(q.difficulty)) {
        issues.push({
            level: 'error', row, field: 'difficulty',
            message: `无效难度: ${q.difficulty}`,
            value: q.difficulty, code: 'INVALID_ENUM_VALUE'
        });
    }

    // 3) correct_answer 对齐触发器逻辑
    const ans = q.correct_answer as Record<string, unknown>;

    // 允许 {} (草稿)
    if (isEmptyPlainObject(ans)) {
        issues.push({
            level: 'warning', row, field: 'correct_answer',
            message: 'correct_answer 为空: 数据库允许 (草稿)，但复习/考试时可能不可用'
        });
        return issues;
    }

    // 非空必须有 type
    if (!isPlainObject(ans) || !toStr(ans.type)) {
        issues.push({
            level: 'error', row, field: 'correct_answer.type',
            message: 'correct_answer 非空时必须包含 type 字段',
            value: ans, code: 'MISSING_REQUIRED_FIELD'
        });
        return issues;
    }

    const ansType = String(ans.type).trim();
    if (ansType !== q.question_type) {
        issues.push({
            level: 'error', row, field: 'correct_answer.type',
            message: `答案类型 "${ansType}" 与题型 "${q.question_type}" 不匹配`,
            value: ansType, code: 'TYPE_MISMATCH'
        });
    }

    // choice
    if (q.question_type === 'choice') {
        const choiceIds: string[] = Array.isArray(ans.choice_ids)
            ? (ans.choice_ids as unknown[]).map(x => String(x).trim()).filter(Boolean)
            : [];
        const choiceId = toStr(ans.choice_id);
        const merged = uniq([...choiceIds, ...(choiceId ? [choiceId] : [])]);

        if (merged.length === 0) {
            issues.push({
                level: 'error', row, field: 'correct_answer.choice_ids',
                message: '选择题 correct_answer 必须包含非空 choice_ids(数组) 或 choice_id',
                code: 'MISSING_REQUIRED_FIELD'
            });
        }

        // 唯一性
        if (choiceIds.length && uniq(choiceIds).length !== choiceIds.length) {
            issues.push({
                level: 'error', row, field: 'correct_answer.choice_ids',
                message: 'choice_ids 存在重复项',
                value: choiceIds, code: 'DUPLICATE_ANSWERS'
            });
        }

        // 检查 choice_ids 是否在 hints.choices 中
        const hints = q.hints as Hints | undefined;
        const rawChoices = isPlainObject(hints) ? hints.choices : null;

        if (rawChoices && merged.length) {
            let validIds: Set<string>;
            if (Array.isArray(rawChoices)) {
                validIds = new Set(rawChoices.map(c => String(c?.id || '').trim()).filter(Boolean));
            } else if (isPlainObject(rawChoices)) {
                validIds = new Set(Object.keys(rawChoices).map(k => k.trim()).filter(Boolean));
            } else {
                validIds = new Set();
            }

            const invalid = merged.filter(id => !validIds.has(id));
            if (invalid.length) {
                issues.push({
                    level: 'error', row, field: 'correct_answer.choice_ids',
                    message: `答案引用的选项 id 不存在于 hints.choices: ${invalid.join(', ')}`,
                    value: invalid, code: 'INVALID_CHOICE_IDS'
                });
            }
        } else if (merged.length) {
            issues.push({
                level: 'warning', row, field: 'hints.choices',
                message: '选择题缺少 hints.choices: 数据库允许，但 UI 可能无法渲染选项'
            });
        }
    }

    // fill_blank
    if (q.question_type === 'fill_blank') {
        const blanks = Array.isArray(ans.blanks) ? ans.blanks : null;
        if (!blanks || blanks.length === 0) {
            issues.push({
                level: 'error', row, field: 'correct_answer.blanks',
                message: '填空题 correct_answer.blanks 必须是非空数组',
                value: ans.blanks, code: 'INVALID_STRUCTURE'
            });
        } else {
            const nonEmpty = (blanks as unknown[]).map(x => String(x).trim()).filter(Boolean);
            if (nonEmpty.length !== blanks.length) {
                issues.push({
                    level: 'error', row, field: 'correct_answer.blanks',
                    message: '填空题 blanks 不能包含空字符串',
                    value: blanks, code: 'INVALID_STRUCTURE'
                });
            }
        }
    }

    // short_answer
    if (q.question_type === 'short_answer') {
        const answers = Array.isArray(ans.answers) ? ans.answers : null;
        if (!answers || answers.length === 0) {
            issues.push({
                level: 'error', row, field: 'correct_answer.answers',
                message: '简答题 correct_answer.answers 必须是非空数组',
                value: ans.answers, code: 'INVALID_STRUCTURE'
            });
        } else {
            const badType = (answers as unknown[]).find(x => typeof x !== 'string');
            if (badType !== undefined) {
                issues.push({
                    level: 'error', row, field: 'correct_answer.answers',
                    message: '简答题 answers 的每一项必须是字符串',
                    value: badType, code: 'NON_STRING_ANSWER'
                });
            }
            const trimmed = (answers as unknown[]).map(x => String(x || '').trim()).filter(Boolean);
            if (trimmed.length !== answers.length) {
                issues.push({
                    level: 'error', row, field: 'correct_answer.answers',
                    message: '简答题 answers 不能包含空字符串',
                    value: answers, code: 'INVALID_STRUCTURE'
                });
            }
            if (uniq(trimmed).length !== trimmed.length) {
                issues.push({
                    level: 'error', row, field: 'correct_answer.answers',
                    message: '简答题答案存在重复项',
                    value: answers, code: 'DUPLICATE_ANSWERS'
                });
            }
        }
    }

    return issues;
}

// ============================================
// JSON Parsing
// ============================================

export function parseJSONText(jsonText: string): ParseResult {
    const t0 = nowMs();
    const issues: ValidationIssue[] = [];
    const items: ImportItem[] = [];
    let totalRows = 0;

    try {
        const parsed = JSON.parse(jsonText);
        // 支持: [] / {} / { questions: [] }
        const arr = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.questions) ? parsed.questions : [parsed]);

        totalRows = arr.length;

        for (let i = 0; i < arr.length; i++) {
            const row = i + 1;
            const { item, issues: normIssues } = normalizeQuestion(arr[i], row);
            const valIssues = validateItem(item);
            items.push(item);
            issues.push(...normIssues, ...valIssues);
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        issues.push({
            level: 'error', row: 0, field: 'JSON',
            message: `JSON 解析失败: ${msg}`,
            code: 'INVALID_JSON'
        });
    }

    const errorCount = issues.filter(i => i.level === 'error').length;
    const warningCount = issues.filter(i => i.level === 'warning').length;
    const invalidRows = new Set(issues.filter(i => i.level === 'error').map(i => i.row));
    const validCount = items.filter(it => !invalidRows.has(it.__row)).length;

    return {
        items,
        issues,
        stats: {
            parseTimeMs: nowMs() - t0,
            totalRows,
            validCount,
            errorCount,
            warningCount
        }
    };
}

// ============================================
// CSV Parsing
// ============================================

export interface CSVColumnMapping {
    title: string;
    content?: string;
    question_type?: string;
    difficulty?: string;
    explanation?: string;
    correct_answer?: string;
    correct_answer_text?: string;
    hints?: string;
    choices?: string;           // 简化格式: "A|选项A;B|选项B"
    correct_choice?: string;    // 简化格式: "A" 或 "A,B"
    image_url?: string;
    explanation_image_url?: string;
    correct_answer_image_url?: string;
    subject_name?: string;
    tag_names?: string;
}

export const DEFAULT_CSV_MAPPING: CSVColumnMapping = {
    title: 'title',
    content: 'content',
    question_type: 'question_type',
    difficulty: 'difficulty',
    explanation: 'explanation',
    correct_answer: 'correct_answer',
    correct_answer_text: 'correct_answer_text',
    hints: 'hints',
    choices: 'choices',
    correct_choice: 'correct_choice',
    image_url: 'image_url',
    explanation_image_url: 'explanation_image_url',
    correct_answer_image_url: 'correct_answer_image_url',
    subject_name: 'subject_name',
    tag_names: 'tag_names'
};

/** 简化格式选项解析: "A|选项A;B|选项B" */
function parseSimplifiedChoices(choicesStr: string): Array<{ id: string; text: string }> {
    if (!choicesStr?.trim()) return [];
    return choicesStr.split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [rawId, rawText] = part.split('|');
            const id = rawId?.trim().toLowerCase() || safeUUID();
            const text = rawText?.trim() || rawId?.trim() || '';
            return { id, text };
        })
        .filter(c => c.text);
}

/** 简化格式正确答案解析: "A" 或 "A,B" */
function parseSimplifiedCorrectChoice(s: string): string[] {
    if (!s?.trim()) return [];
    return s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

/** CSV 行 -> raw question */
export function transformCSVRow(
    row: Record<string, string>,
    mapping: CSVColumnMapping,
    rowIndex: number
): { raw: Record<string, unknown>; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];
    const raw: Record<string, unknown> = {};

    const get = (k?: string) => {
        const val = k ? (row[k] ?? '') : '';
        return val.trim();
    };

    raw.title = get(mapping.title);
    if (mapping.content) raw.content = toStr(get(mapping.content));
    raw.question_type = toStr(get(mapping.question_type));
    raw.difficulty = toStr(get(mapping.difficulty));
    raw.explanation = toStr(get(mapping.explanation));
    raw.correct_answer_text = toStr(get(mapping.correct_answer_text));
    raw.image_url = toStr(get(mapping.image_url));
    raw.explanation_image_url = toStr(get(mapping.explanation_image_url));
    raw.correct_answer_image_url = toStr(get(mapping.correct_answer_image_url));

    const subjectName = toStr(get(mapping.subject_name));
    if (subjectName) raw.subject_name = subjectName;

    const tagNamesRaw = toStr(get(mapping.tag_names));
    if (tagNamesRaw) raw.tag_names = splitTokens(tagNamesRaw, /[;,、]+/g);

    const robustParse = (input: string, field: string) => {
        if (!input) return {};
        let normalized = input.trim();

        // Handle potential CSV double-quoting artifacts if PapaParse failed to fully clean
        if (normalized.startsWith('"') && normalized.endsWith('"')) {
            normalized = normalized.slice(1, -1).replace(/""/g, '"');
        }

        try {
            return JSON.parse(normalized);
        } catch (e1) {
            // High-precision recovery for LaTeX/Math content in CSV-JSON
            // Common failure: "$\begin" instead of "$\\begin"
            try {
                // Escape backslashes that are NOT followed by a double quote (a valid JSON escape)
                // This preserves valid \" while allowing LaTeX commands like \frac, \begin and \\
                const escaped = normalized.replace(/\\(?!["])/g, '\\\\');
                return JSON.parse(escaped);
            } catch (e2) {
                issues.push({
                    level: 'error', row: rowIndex, field: field,
                    message: `${field} JSON 解析失败: ${e1 instanceof Error ? e1.message : 'Invalid format'}`,
                    value: input, code: 'INVALID_JSON'
                });
                return {};
            }
        }
    };

    // Parse hints and handle choices mapping
    const hintsRaw = toStr(get(mapping.hints));
    const choicesRaw = toStr(get(mapping.choices));

    if (hintsRaw) {
        raw.hints = robustParse(hintsRaw, 'hints');
    } else if (choicesRaw) {
        raw.hints = { choices: parseSimplifiedChoices(choicesRaw) };
    }

    // Parse correct_answer
    const answerRaw = toStr(get(mapping.correct_answer));
    const correctChoiceRaw = toStr(get(mapping.correct_choice));

    if (answerRaw) {
        raw.correct_answer = robustParse(answerRaw, 'correct_answer');
    } else if (correctChoiceRaw) {
        raw.correct_answer = {
            type: 'choice',
            choice_ids: parseSimplifiedCorrectChoice(correctChoiceRaw)
        };
    } else {
        raw.correct_answer = {};
    }

    return { raw, issues };
}

export type CSVInput = string | File;

/** 解析 CSV (支持 File - 可用 worker 后台解析) */
export async function parseCSV(
    input: CSVInput,
    mapping: CSVColumnMapping = DEFAULT_CSV_MAPPING
): Promise<ParseResult> {
    const t0 = nowMs();
    const Papa = await import('papaparse').then(m => m.default);

    const issues: ValidationIssue[] = [];
    const items: ImportItem[] = [];

    // PapaParse 需要区分 string 和 File 类型
    const isFileInput = typeof File !== 'undefined' && input instanceof File;

    await new Promise<void>((resolve) => {
        function executeParse(useWorker: boolean) {
            try {
                if (isFileInput) {
                    Papa.parse(input as File, {
                        header: true,
                        skipEmptyLines: 'greedy',
                        dynamicTyping: false,
                        worker: useWorker,
                        complete: handleComplete,
                        error: (err: any) => {
                            // If worker failed due to CSP/Security, retry synchronously
                            if (useWorker && (String(err).includes('Worker') || String(err).includes('Security'))) {
                                console.warn('PapaParse Worker blocked by environment/CSP. Retrying synchronously...');
                                executeParse(false);
                            } else {
                                handleError(err);
                            }
                        }
                    });
                } else {
                    Papa.parse(input as string, {
                        header: true,
                        skipEmptyLines: 'greedy',
                        dynamicTyping: false,
                        complete: handleComplete,
                        error: handleError
                    });
                }
            } catch (e) {
                if (useWorker) {
                    console.warn('PapaParse Worker synchronous failure. Falling back...', e);
                    executeParse(false);
                } else {
                    handleError(e as Error);
                }
            }
        }

        executeParse(isFileInput); // Only attempt worker for actual File inputs

        function handleComplete(results: { data?: unknown[] }) {
            const rows = (results.data ?? []) as Record<string, string>[];
            for (let i = 0; i < rows.length; i++) {
                const rowIndex = i + 1;
                const { raw, issues: transformIssues } = transformCSVRow(rows[i], mapping, rowIndex);
                const { item, issues: normIssues } = normalizeQuestion(raw, rowIndex);
                const valIssues = validateItem(item);

                items.push(item);
                issues.push(...transformIssues, ...normIssues, ...valIssues);
            }
            resolve();
        }

        function handleError(err: any) {
            issues.push({
                level: 'error', row: 0, field: 'CSV',
                message: `CSV 解析失败: ${err?.message ?? String(err)}`,
                code: 'UNSUPPORTED_FORMAT'
            });
            resolve();
        }
    });

    const totalRows = items.length;
    const errorCount = issues.filter(i => i.level === 'error').length;
    const warningCount = issues.filter(i => i.level === 'warning').length;
    const invalidRows = new Set(issues.filter(i => i.level === 'error').map(i => i.row));
    const validCount = items.filter(it => !invalidRows.has(it.__row)).length;

    return {
        items,
        issues,
        stats: {
            parseTimeMs: nowMs() - t0,
            totalRows,
            validCount,
            errorCount,
            warningCount
        }
    };
}

// ============================================
// Auto-detect Parser
// ============================================

export async function parseImportData(
    input: { text?: string; file?: File } | string,
    opts?: { format?: 'auto' | 'json' | 'csv'; csvMapping?: CSVColumnMapping }
): Promise<ParseResult> {
    const format = opts?.format ?? 'auto';

    // 兼容旧 API: 直接传 string
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) {
            return { items: [], issues: [], stats: { parseTimeMs: 0, totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0 } };
        }
        const detected = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? 'json' : 'csv';
        const finalFmt = format === 'auto' ? detected : format;
        return finalFmt === 'json' ? parseJSONText(input) : parseCSV(input, opts?.csvMapping);
    }

    // File 优先
    if (input.file) {
        const name = input.file.name.toLowerCase();
        const isJson = name.endsWith('.json');
        const isCsv = name.endsWith('.csv');

        if (format === 'json' || (format === 'auto' && isJson)) {
            const text = await input.file.text();
            return parseJSONText(text);
        }
        if (format === 'csv' || (format === 'auto' && isCsv)) {
            return parseCSV(input.file, opts?.csvMapping);
        }

        return {
            items: [],
            issues: [{
                level: 'error', row: 0, field: 'format',
                message: `无法自动识别文件格式: ${input.file.name}`,
                code: 'UNSUPPORTED_FORMAT'
            }],
            stats: { parseTimeMs: 0, totalRows: 0, validCount: 0, errorCount: 1, warningCount: 0 }
        };
    }

    // text
    const text = input.text ?? '';
    if (!text.trim()) {
        return { items: [], issues: [], stats: { parseTimeMs: 0, totalRows: 0, validCount: 0, errorCount: 0, warningCount: 0 } };
    }

    const trimmed = text.trim();
    const detected = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? 'json' : 'csv';
    const finalFmt = format === 'auto' ? detected : format;
    return finalFmt === 'json' ? parseJSONText(text) : parseCSV(text, opts?.csvMapping);
}

// ============================================
// Insert Helpers
// ============================================

export function calculateOptimalBatchSize(questions: unknown[]): number {
    if (!questions.length) return 50;
    const sampleSize = Math.min(10, questions.length);
    const avgSize = questions.slice(0, sampleSize)
        .reduce<number>((sum, q) => sum + JSON.stringify(q).length, 0) / sampleSize;

    const maxPayloadSize = 900 * 1024; // ~0.9MB (保守)
    const optimal = Math.floor(maxPayloadSize / Math.max(200, avgSize));
    return Math.max(10, Math.min(200, optimal));
}

export function buildQuestionInsertPayload(
    item: ImportItem,
    params: {
        userId: string;
        importBatchId: string;
        defaultSubjectId?: string;
    }
): Record<string, unknown> {
    const q = item.question;

    // [V3.2] 使用 resolved.subject_id 优先，兼容旧逻辑
    const finalSubjectId = item.resolved?.subject_id ?? (q.subject_id as string | undefined) ?? params.defaultSubjectId;

    // [V3.2] metadata.__import 结构用于 row->id 映射
    const metadata0 = isPlainObject(q.metadata) ? (q.metadata as Record<string, unknown>) : {};
    const metadata = {
        ...metadata0,
        __import: {
            batch_id: params.importBatchId,
            row: item.__row,
            at: new Date().toISOString(),
        },
    };

    const payload: Record<string, unknown> = {
        user_id: params.userId,
        title: q.title,
        content: q.content,
        question_type: q.question_type,
        difficulty: q.difficulty,
        explanation: q.explanation,
        correct_answer: q.correct_answer ?? {},
        correct_answer_text: q.correct_answer_text,
        hints: q.hints,
        metadata,
        image_url: q.image_url,
        explanation_image_url: q.explanation_image_url,
        correct_answer_image_url: q.correct_answer_image_url,
        subject_id: finalSubjectId,
    };

    // 精简 payload: 移除 undefined
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    return payload;
}

/**
 * 批量插入 + 二分法定位坏行
 * [V3.2] 返回 rowToQuestionId 用于后续关联创建
 */
export async function insertQuestionsWithBisect(
    client: SupabaseClient,
    items: ImportItem[],
    params: {
        userId: string;
        defaultSubjectId?: string;
        importBatchId?: string;
        onProgress?: (p: BatchInsertProgress) => void;
        abortSignal?: AbortSignal;
    }
): Promise<BatchInsertResult> {
    const importBatchId = params.importBatchId ?? safeUUID();

    const payloads = items.map(it => ({
        __row: it.__row,
        payload: buildQuestionInsertPayload(it, {
            userId: params.userId,
            importBatchId,
            defaultSubjectId: params.defaultSubjectId,
        })
    }));

    const insertedIds: string[] = [];
    const rowErrors: Array<{ row: number; error: string }> = [];
    const rowToQuestionId: Record<number, string> = {};
    const total = payloads.length;
    let success = 0;
    let failed = 0;

    async function tryInsertBatch(batch: typeof payloads): Promise<{ ok: boolean; error?: string }> {
        const dataToInsert = batch.map(b => b.payload);
        const { data, error } = await client
            .from('error_questions')
            .insert(dataToInsert, { count: 'exact' })
            .select('id, metadata');

        if (error) return { ok: false, error: formatPgError(error) };

        // [V3.2] 通过 metadata.__import.row 建立 row->id 映射
        for (const r of (data ?? []) as Array<{ id: string; metadata: any }>) {
            insertedIds.push(r.id);
            const row = r?.metadata?.__import?.row;
            if (typeof row === 'number') rowToQuestionId[row] = r.id;
        }
        return { ok: true };
    }

    // 二分定位坏行
    async function bisect(batch: typeof payloads): Promise<void> {
        if (params.abortSignal?.aborted) throw new Error('Import aborted');

        if (batch.length === 1) {
            const only = batch[0];
            const res = await tryInsertBatch(batch);
            if (!res.ok) {
                failed += 1;
                rowErrors.push({
                    row: only.__row,
                    error: res.error ?? 'Insert failed (constraint/trigger/RLS)'
                });
            } else {
                success += 1;
            }
            params.onProgress?.({ phase: 'bisecting', current: success + failed, total, success, failed });
            return;
        }

        const mid = Math.floor(batch.length / 2);
        const left = batch.slice(0, mid);
        const right = batch.slice(mid);

        const lres = await tryInsertBatch(left);
        if (lres.ok) {
            success += left.length;
            params.onProgress?.({ phase: 'bisecting', current: success + failed, total, success, failed });
        } else {
            await bisect(left);
        }

        const rres = await tryInsertBatch(right);
        if (rres.ok) {
            success += right.length;
            params.onProgress?.({ phase: 'bisecting', current: success + failed, total, success, failed });
        } else {
            await bisect(right);
        }
    }

    // 主流程
    const batchSize = calculateOptimalBatchSize(payloads.map(x => x.payload));
    for (let i = 0; i < payloads.length; i += batchSize) {
        if (params.abortSignal?.aborted) throw new Error('Import aborted');

        const batch = payloads.slice(i, i + batchSize);
        params.onProgress?.({ phase: 'inserting', current: Math.min(i + batch.length, total), total, success, failed });

        const res = await tryInsertBatch(batch);
        if (res.ok) {
            success += batch.length;
            continue;
        }

        await bisect(batch);
    }

    params.onProgress?.({ phase: 'done', current: total, total, success, failed });

    return { success, failed, rowErrors, insertedIds, rowToQuestionId, importBatchId };
}

// ============================================
// Tag & Card Helpers
// ============================================

export async function createQuestionTagAssociations(
    questionId: string,
    tagNames: string[],
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const tagIds: string[] = [];

    for (const tagName of tagNames) {
        const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName)
            .or(`user_id.is.null,user_id.eq.${userId}`)
            .is('deleted_at', null)
            .single();

        if (existingTag) {
            tagIds.push(existingTag.id);
        } else {
            const { data: newTag, error } = await supabase
                .from('tags')
                .insert({ name: tagName, user_id: userId })
                .select('id')
                .single();

            if (error) {
                return { success: false, error: `创建标签 "${tagName}" 失败: ${error.message}` };
            }
            tagIds.push(newTag.id);
        }
    }

    if (tagIds.length > 0) {
        const { error } = await supabase
            .from('error_question_tags')
            .insert(tagIds.map(tagId => ({ question_id: questionId, tag_id: tagId })));

        if (error) {
            return { success: false, error: `创建标签关联失败: ${error.message}` };
        }
    }

    return { success: true };
}

export async function createCards(
    questionIds: string[],
    userId: string,
    config: ImportConfig
): Promise<{ success: number; failed: number; cardIds: string[] }> {
    const cardIds: string[] = [];
    let success = 0;
    let failed = 0;
    const now = new Date();

    const calculateDue = (index: number): Date => {
        const base = config.cards_due_start || now;
        switch (config.cards_due_spread) {
            case 'spread_1d':
                return new Date(base.getTime() + (index / questionIds.length) * 24 * 60 * 60 * 1000);
            case 'spread_7d':
                return new Date(base.getTime() + (index / questionIds.length) * 7 * 24 * 60 * 60 * 1000);
            default:
                return base;
        }
    };

    const BATCH_SIZE = 50;
    for (let i = 0; i < questionIds.length; i += BATCH_SIZE) {
        const batch = questionIds.slice(i, i + BATCH_SIZE);
        const payload = batch.map((qid, idx) => ({
            user_id: userId,
            question_id: qid,
            state: 0,
            due: calculateDue(i + idx).toISOString()
        }));

        const { data, error } = await supabase
            .from('cards')
            .insert(payload)
            .select('id');

        if (error) {
            failed += batch.length;
        } else {
            success += data?.length || 0;
            cardIds.push(...(data?.map(c => c.id) || []));
        }
    }

    return { success, failed, cardIds };
}

// ============================================
// Batch Subject/Tag Resolution (P2 Enhancement)
// ============================================

type SubjectRow = { id: string; name: string; user_id: string | null; deleted_at: string | null };
type TagRow = { id: string; name: string; user_id: string | null; deleted_at: string | null };

/**
 * Batch resolve subject names to IDs.
 * Prefers user's private subjects over public ones.
 * Creates missing subjects as private if not found.
 */
async function resolveSubjectsByName(
    client: SupabaseClient,
    userId: string,
    names: string[]
): Promise<Record<string, string>> {
    const wanted = uniq(names.map(n => n.trim()).filter(Boolean));
    if (!wanted.length) return {};

    const { data: rows, error } = await client
        .from('subjects')
        .select('id,name,user_id,deleted_at')
        .in('name', wanted)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .is('deleted_at', null);

    if (error) throw error;

    const grouped = new Map<string, SubjectRow[]>();
    for (const r of (rows ?? []) as SubjectRow[]) {
        grouped.set(r.name, [...(grouped.get(r.name) ?? []), r]);
    }

    const nameToId: Record<string, string> = {};
    const missing: string[] = [];
    for (const n of wanted) {
        const g = grouped.get(n) ?? [];
        const mine = g.find(x => x.user_id === userId);
        const pub = g.find(x => x.user_id === null);
        if (mine?.id) nameToId[n] = mine.id;
        else if (pub?.id) nameToId[n] = pub.id;
        else missing.push(n);
    }

    if (missing.length) {
        const payload = missing.map(n => ({ name: n, user_id: userId }));
        const ins = await client.from('subjects').insert(payload).select('id,name,user_id');
        if (ins.error) {
            const refetch = await client
                .from('subjects')
                .select('id,name,user_id,deleted_at')
                .in('name', missing)
                .or(`user_id.is.null,user_id.eq.${userId}`)
                .is('deleted_at', null);
            if (refetch.error) throw ins.error;
            for (const r of (refetch.data ?? []) as SubjectRow[]) {
                if (!nameToId[r.name]) {
                    if (r.user_id === userId || r.user_id === null) {
                        nameToId[r.name] = r.id;
                    }
                }
            }
        } else {
            for (const r of (ins.data ?? []) as Array<{ id: string; name: string; user_id: string | null }>) {
                if (r.user_id === userId) nameToId[r.name] = r.id;
            }
        }
    }

    return nameToId;
}

/**
 * Batch resolve tag names to IDs.
 * Prefers user's private tags over public ones.
 * Creates missing tags as private if not found.
 */
async function resolveTagsByName(
    client: SupabaseClient,
    userId: string,
    names: string[]
): Promise<Record<string, string>> {
    const wanted = uniq(names.map(n => n.trim()).filter(Boolean));
    if (!wanted.length) return {};

    const { data: rows, error } = await client
        .from('tags')
        .select('id,name,user_id,deleted_at')
        .in('name', wanted)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .is('deleted_at', null);

    if (error) throw error;

    const grouped = new Map<string, TagRow[]>();
    for (const r of (rows ?? []) as TagRow[]) {
        grouped.set(r.name, [...(grouped.get(r.name) ?? []), r]);
    }

    const nameToId: Record<string, string> = {};
    const missing: string[] = [];
    for (const n of wanted) {
        const g = grouped.get(n) ?? [];
        const mine = g.find(x => x.user_id === userId);
        const pub = g.find(x => x.user_id === null);
        if (mine?.id) nameToId[n] = mine.id;
        else if (pub?.id) nameToId[n] = pub.id;
        else missing.push(n);
    }

    if (missing.length) {
        const payload = missing.map(n => ({ name: n, user_id: userId }));
        const ins = await client.from('tags').insert(payload).select('id,name,user_id');
        if (ins.error) {
            const refetch = await client
                .from('tags')
                .select('id,name,user_id,deleted_at')
                .in('name', missing)
                .or(`user_id.is.null,user_id.eq.${userId}`)
                .is('deleted_at', null);
            if (refetch.error) throw ins.error;
            for (const r of (refetch.data ?? []) as TagRow[]) {
                if (!nameToId[r.name]) {
                    if (r.user_id === userId || r.user_id === null) {
                        nameToId[r.name] = r.id;
                    }
                }
            }
        } else {
            for (const r of (ins.data ?? []) as Array<{ id: string; name: string; user_id: string | null }>) {
                if (r.user_id === userId) nameToId[r.name] = r.id;
            }
        }
    }

    return nameToId;
}

/**
 * Resolve subject_name/tag_names into IDs and attach to item.resolved
 */
export async function resolveReferencesForItems(
    client: SupabaseClient,
    userId: string,
    items: ImportItem[],
    config?: { defaultSubjectId?: string; defaultTagIds?: string[] }
): Promise<void> {
    const subjectNames = uniq(items.map(it => it.subject_name).filter(Boolean) as string[]);
    const tagNames = uniq(items.flatMap(it => it.tag_names ?? []).filter(Boolean));

    const subjectMap = await resolveSubjectsByName(client, userId, subjectNames);
    const tagMap = await resolveTagsByName(client, userId, tagNames);

    for (const it of items) {
        const resolvedSubjectId = it.question.subject_id
            ? String(it.question.subject_id)
            : it.subject_name && subjectMap[it.subject_name]
                ? subjectMap[it.subject_name]
                : config?.defaultSubjectId;

        const resolvedTagIds = uniq([
            ...(config?.defaultTagIds ?? []),
            ...((it.tag_names ?? []).map(n => tagMap[n]).filter(Boolean) as string[]),
        ]);

        it.resolved = {
            subject_id: resolvedSubjectId,
            tag_ids: resolvedTagIds.length ? resolvedTagIds : undefined,
        };
    }
}

/**
 * Bulk create question-tag associations
 */
export async function createQuestionTagAssociationsBulk(
    client: SupabaseClient,
    items: ImportItem[],
    rowToQuestionId: Record<number, string>
): Promise<{ success: number; failed: number; errors: Array<{ row: number; error: string }> }> {
    const rows: Array<{ question_id: string; tag_id: string; __row: number }> = [];

    for (const it of items) {
        const qid = rowToQuestionId[it.__row];
        if (!qid) continue;
        const tagIds = it.resolved?.tag_ids ?? [];
        for (const tid of tagIds) rows.push({ question_id: qid, tag_id: tid, __row: it.__row });
    }

    if (!rows.length) return { success: 0, failed: 0, errors: [] };

    const payload = rows.map(r => ({ question_id: r.question_id, tag_id: r.tag_id }));

    const { error } = await client
        .from('error_question_tags')
        .upsert(payload, { onConflict: 'question_id,tag_id', ignoreDuplicates: true });

    if (error) {
        return {
            success: 0,
            failed: rows.length,
            errors: [{ row: 0, error: formatPgError(error) }],
        };
    }

    return { success: rows.length, failed: 0, errors: [] };
}

// ============================================
// High-Level Pipeline (Recommended Entry)
// ============================================

export interface ImportPipelineResult extends BatchInsertResult {
    tagAssoc?: { success: number; failed: number; errors: Array<{ row: number; error: string }> };
    cards?: { success: number; failed: number; cardIds: string[] };
}

/**
 * High-level import pipeline that handles:
 * 1. Filtering valid items
 * 2. Resolving subject/tag references
 * 3. Batch inserting questions
 * 4. Creating tag associations
 * 5. Optionally creating cards
 */
export async function runImportPipeline(params: {
    client?: SupabaseClient;
    userId: string;
    parse: ParseResult;
    config?: ImportConfig;
    onProgress?: (p: BatchInsertProgress) => void;
    abortSignal?: AbortSignal;
}): Promise<ImportPipelineResult> {
    const client = params.client ?? supabase;

    // 1) Filter valid rows
    const validItems = getValidItems(params.parse);

    // 2) Resolve subject/tag references
    await resolveReferencesForItems(client, params.userId, validItems, {
        defaultSubjectId: params.config?.defaultSubjectId,
        defaultTagIds: params.config?.defaultTagIds,
    });

    // 3) Insert questions (+ bisect)
    const inserted = await insertQuestionsWithBisect(client, validItems, {
        userId: params.userId,
        defaultSubjectId: params.config?.defaultSubjectId,
        importBatchId: params.config?.importBatchId,
        onProgress: params.onProgress,
        abortSignal: params.abortSignal,
    });

    // 4) Tag associations
    const tagAssoc = await createQuestionTagAssociationsBulk(client, validItems, inserted.rowToQuestionId);

    // 5) Cards (optional)
    let cards: { success: number; failed: number; cardIds: string[] } | undefined;
    if (params.config?.create_cards) {
        const qids = Object.values(inserted.rowToQuestionId);
        cards = await createCards(qids, params.userId, {
            cards_due_start: params.config.cards_due_start,
            cards_due_spread: params.config.cards_due_spread ?? 'immediate',
        });
    }

    return { ...inserted, tagAssoc, cards };
}

// ============================================
// Templates
// ============================================

export const JSON_TEMPLATE = [
    {
        title: '以下哪个是正确的选项？',
        content: '这是题目的详细描述内容',
        question_type: 'choice',
        difficulty: 'medium',
        explanation: '这是答案解析',
        correct_answer: { type: 'choice', choice_ids: ['a'] },
        hints: {
            choices: [
                { id: 'a', text: '正确选项' },
                { id: 'b', text: '错误选项1' },
                { id: 'c', text: '错误选项2' }
            ]
        },
        tag_names: ['易错', '高频考点'],
        subject_name: '数学'
    },
    {
        title: '请填写下列空白',
        question_type: 'fill_blank',
        difficulty: 'easy',
        correct_answer_text: '答案1,答案2'
    }
];

export const CSV_TEMPLATE = `title,question_type,difficulty,choices,correct_choice,correct_answer_text,explanation,subject_name,tag_names
"选择题示例",choice,medium,"a|选项A;b|选项B;c|选项C","a","","解析内容","数学","易错,高频考点"
"填空题示例",fill_blank,easy,"","","答案1,答案2","解析内容","英语","基础"
`;

/**
 * 通用文本文件下载工具
 */
export function downloadTextFile(filename: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 将 ImportItem 转换为 ParsedQuestion (兼容旧 API)
 */
export function itemToParsedQuestion(item: ImportItem): ParsedQuestion {
    return {
        ...item.question,
        tag_names: item.tag_names,
        subject_name: item.subject_name,
        __row: item.__row,
    } as ParsedQuestion;
}

/**
 * 获取有效的 ImportItems (无 error 的行)
 */
export function getValidItems(result: ParseResult): ImportItem[] {
    const invalidRows = new Set(result.issues.filter(i => i.level === 'error').map(i => i.row));
    return result.items.filter(it => !invalidRows.has(it.__row));
}
