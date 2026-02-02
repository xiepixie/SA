# V2 高级实体管理设计 (Advanced Management)

> **版本**: V5.9 (Audit Ready)

---

针对学科 (Subjects) 与标签 (Tags) 的"合并、删除、撤销"高阶需求，通过 **软删除 (Soft Delete)** 与 **操作流水账 (Management Ledger)** 实现生产级的容错、可追溯与审计合规。

---

## 1. 核心模型设计

### 1.1 软删除支持

**适用表**: `subjects`, `tags`

**字段**: `deleted_at TIMESTAMPTZ`

**设计要点**:

1. **RLS 策略增强**: 所有 Select 策略增加 `deleted_at IS NULL` 检查
2. **条件唯一索引**: 支持"删除即释放名称"
   ```sql
   CREATE UNIQUE INDEX uq_subjects_user_name 
   ON subjects(user_id, name) 
   WHERE deleted_at IS NULL;
   ```
3. **审计白名单**: 所有管理 RPC 显式设置 `search_path = pg_catalog, public`

### 1.2 操作流水账 (`management_logs`)

记录每一次敏感操作，作为撤销的唯一依据。

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | UUID | 主键 |
| `user_id` | UUID | 操作人 |
| `op_type` | ENUM | `merge`, `delete` |
| `entity_type` | ENUM | `subject`, `tag` |
| `source_id` | UUID | 原始实体 ID |
| `target_id` | UUID | 目标实体 ID (Merge 时) |
| `affected_ids` | UUID[] | 受影响的题目 ID 列表 |
| `metadata` | JSONB | 完整快照 (颜色、名称等) |
| `undone_at` | TIMESTAMPTZ | 撤销时间 |
| `undone_by` | UUID | 撤销操作人 |

---

## 2. 业务逻辑实现

### 2.1 智能合并 (Merge Logic)

#### 学科合并 (`merge_subjects`)

```sql
-- 1. 事务级咨询锁 (防并发)
PERFORM pg_advisory_xact_lock(hashtext('merge_subjects' || user_id));

-- 2. 收集受影响 IDs
SELECT array_agg(id) INTO v_affected_ids 
FROM error_questions WHERE subject_id = source_id;

-- 3. 执行迁移
UPDATE error_questions SET subject_id = target_id 
WHERE subject_id = source_id;
UPDATE exam_records SET subject_id = target_id 
WHERE subject_id = source_id;

-- 4. 软删除源实体
UPDATE subjects SET deleted_at = now() WHERE id = source_id;

-- 5. 记录日志 (含完整快照)
INSERT INTO management_logs (...) VALUES (...);
```

#### 标签合并 (`merge_tags`)

**特殊处理**: 标签有两层关联

1. **资产层**: `error_question_tags` (题目-标签关联)
2. **学习层**: `cards.personal_tags` (个人标签 JSONB 数组)

```sql
-- 1. 迁移题目-标签关联
INSERT INTO error_question_tags (question_id, tag_id)
SELECT question_id, target_id FROM error_question_tags 
WHERE tag_id = source_id
ON CONFLICT DO NOTHING;

-- 2. 清理源标签关联
DELETE FROM error_question_tags WHERE tag_id = source_id;

-- 3. 更新 cards 表中的个人标签 JSONB
UPDATE cards SET personal_tags = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT CASE 
      WHEN (v->>'') = source_id::text THEN to_jsonb(target_id::text) 
      ELSE v 
    END AS val
    FROM jsonb_array_elements(personal_tags) AS v
  ) s
)
WHERE personal_tags ? source_id::text;
```

### 2.2 原子撤销 (Undo Logic)

通过 `undo_management_op(log_id)` 发起：

```sql
-- 1. 恢复实体
UPDATE subjects/tags SET deleted_at = NULL WHERE id = source_id;

-- 2. 还原关系 (Merge 撤销)
-- 根据 affected_ids 将关联从 target 删去，重新链回 source
INSERT INTO error_question_tags (question_id, tag_id)
SELECT qid, source_id FROM unnest(affected_ids) AS qid
WHERE EXISTS (SELECT 1 FROM error_questions WHERE id = qid);

-- 3. 精准清理 (基于 merge_timestamp)
DELETE FROM error_question_tags 
WHERE tag_id = target_id 
  AND question_id = ANY(affected_ids)
  AND created_at = metadata->>'merge_timestamp';

-- 4. 深度撤销 (个人标签 JSONB)
UPDATE cards SET personal_tags = (...)
WHERE id = ANY(metadata->'affected_card_ids');

-- 5. 标记日志已撤销
UPDATE management_logs SET undone_at = now(), undone_by = uid 
WHERE id = log_id;
```

---

## 3. 关联影响与级联规则

### 3.1 视图系统过滤

| 视图/函数 | 过滤规则 |
|:---|:---|
| `v_due_cards` | 过滤 `subjects.deleted_at IS NULL` |
| `get_exam_questions` | 过滤 `deleted_at IS NULL` 的标签 |
| RLS 策略 | 默认过滤 `deleted_at IS NULL` |

### 3.2 Fork 逻辑限制

- ❌ 禁止 Fork 已归档题目 (`is_archived = true`)
- ❌ 禁止 Fork 关联已软删除学科的题目
- ✅ 保障核心资产链路的合法性

### 3.3 Realtime 信号集成

| 操作 | 触发信号 |
|:---|:---|
| `merge/delete` | `asset:REFRESH` (刷新左侧菜单) |
| `merge_tags` (影响 personal_tags) | `card_overlay:REFRESH` |

---

## 4. UI 设计规范

### 4.1 合并对话框

```
┌─────────────────────────────────────┐
│  合并标签                            │
├─────────────────────────────────────┤
│  源标签:  [易错题]                   │
│  目标标签: [重点复习]                 │
│                                     │
│  ⚠️ 将影响 23 道题目                 │
│                                     │
│  提示: 可在"操作记录"中撤销此操作     │
│                                     │
│         [取消]    [确认合并]         │
└─────────────────────────────────────┘
```

### 4.2 撤销 Toast

```
┌──────────────────────────────────────────┐
│ ✓ 标签已合并                    [撤销]   │
└──────────────────────────────────────────┘
```

- **时效**: 10 秒自动消失
- **实现**: 调用 `undo_management_op` RPC

### 4.3 操作记录页

| 列 | 内容 |
|:---|:---|
| 时间 | `created_at` |
| 操作 | `merge`/`delete` + 实体类型 |
| 详情 | 源名称 → 目标名称 |
| 影响 | `affected_ids.length` 条记录 |
| 状态 | 已撤销 / [撤销] 按钮 |

---

## 5. 数据清理策略

### 5.1 周期性清理 (`purge_soft_deleted_data`)

**条件**: 软删除超过 30 天 + 无任何引用

```sql
-- 仅限 service_role 调用 (Cron Job)
SELECT purge_soft_deleted_data(30);

-- 返回
{
  "subjects_purged": 5,
  "tags_purged": 12,
  "logs_purged": 8,
  "status": "safety_checks_performed"
}
```

### 5.2 安全保障

- 有题目/考试引用的学科不会被物理删除
- 有关联的标签不会被物理删除
- 审计日志中的 `metadata.full_snapshot` 确保即使物理删除，名称等信息仍可读

---

## 6. 设计目标总结

| 目标 | 实现 |
|:---|:---|
| **后悔药机制化** | `undo_management_op` + Toast UI |
| **大数据量事务一致性** | 咨询锁 + FOR UPDATE |
| **100% 可审计** | `management_logs` 完整快照 |
| **名称复用** | 条件唯一索引 + 软删除 |
| **深度合并** | 资产层 + 学习层双层处理 |
