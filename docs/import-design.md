# 题目导入功能设计 (V3.0 - Implemented)

## 1. 核心特性

本模块提供高性能、高容错的题目导入能力，支持 `JSON` 和 `CSV` 格式。

### 1.1 双轨导入模式 (Dual-Track Import)

系统根据导入数据量自动选择最优路径：

| 模式 | 阈值 (条) | 机制 | 适用场景 |
|:---|:---|:---|:---|
| **即时导入 (Instant)** | < 50 | 前端直连 Supabase，通过 `insertQuestionsWithBisect` 执行 | 少量题目、手动录入 |
| **队列导入 (Queue)** | ≥ 50 | (目前复用即时模式，后续可切 Worker) 利用分批与二分法保证稳定性 | 批量迁移、大文件 |

### 1.2 核心能力
- **弱结构自动补全**: CSV 中填空/简答题只需填 `correct_answer_text`，自动生成 `correct_answer` JSON 结构。
- **二分法坏行定位**: 批量插入遇错时，自动二分拆解，精准定位被触发器拒绝的那一行，保证"能插尽插"。
- **审计追踪**: 每次导入生成 `import_batch_id`，写入 `error_questions.metadata`，支持按批次追溯。
- **Warning/Error 分离**: 区分阻断性错误（如缺必填字段）和警告（如缺 `hints`），提高导入成功率。
- **安全上下文兼容**: `safeUUID` 确保在非 HTTPS 环境 (Localhost) 也能生成 UUID。

## 2. 字段归属 (Schema V5.9)

### 2.1 用户可填字段 (User Input)

| 字段 | 类型 | 说明 | CSV 映射列名 |
|:---|:---|:---|:---|
| `title` | TEXT | **必填**。题干/标题 | `title` |
| `question_type` | ENUM | 默认为 `choice`。支持 `choice`, `fill_blank`, `short_answer` | `question_type` |
| `difficulty` | ENUM | 默认为 `medium`。支持 `easy`, `medium`, `hard` | `difficulty` |
| `content` | TEXT | 题目详细内容/富文本 | `content` |
| `explanation` | TEXT | 解析 | `explanation` |
| `correct_answer` | JSONB | **必填 (强校验)**。标准答案结构体 | `correct_answer` |
| `correct_answer_text` | TEXT | 弱结构输入 (用于自动生成 JSON) | `correct_answer_text` |
| `hints` | JSONB | 选项定义、提示等 | `hints` |
| `image_url` | TEXT | 题目图片 | `image_url` |
| `subject_name` | TEXT | (辅助) 学科名称，自动匹配或提示 | `subject_name` |
| `tag_names` | TEXT[] | (辅助) 标签名称列表，自动创建/关联 | `tag_names` |

### 2.2 系统保留字段 (System Reserved)
用户不可直接写入，由数据库或后端自动管理：
- `id`, `user_id`
- `created_at`, `updated_at`
- `content_hash`, `last_synced_hash`, `forked_from`
- `is_archived`

## 3. CSV 弱结构支持 (Weak Format)

为了让用户能直接用 Excel 编辑，支持以下简化输入，系统解析时自动转换为 JSON。

### 3.1 选择题 (Choice)
- **输入**:
  - `choices`: `A|苹果;B|香蕉;C|橘子`
  - `correct_choice`: `A`
- **自动转换**:
  - `hints.choices`: `[{id:'a', text:'苹果'}, {id:'b', text:'香蕉'}, ...]`
  - `correct_answer`: `{type: 'choice', choice_ids: ['a']}`

### 3.2 填空/简答 (Fill/Short)
- **输入**:
  - `correct_answer_text`: `答案1,答案2` (逗号或分号分隔)
- **自动转换**:
  - `correct_answer`: `{type: 'fill_blank', blanks: ['答案1', '答案2']}`

## 4. 导入流程 (The 4-Step Flow)

### Step 1: Upload (Format Detection)
- 支持文件拖拽 (`File` 对象直接传递给 PapaParse Worker)
- 支持文本粘贴 (自动嗅探 JSON/CSV)
- **优化**: File 模式不读取内容到内存，流式解析，支持大文件。

### Step 2: Validate (Client-Side)
- **Schema 校验**: 对齐 DB 触发器 `validate_correct_answer()`。
- **业务规则**:
  - `correct_answer.type` 必须 === `question_type`
  - `choice_ids` 必须存在于 `hints.choices`
  - 填空/简答题必须有非空答案
- 输出: Valid Items, Errors (Row-level), Warnings.

### Step 3: Config (Import Options)
- **Subject**: 指定默认学科。
- **Create Cards**: 是否同时创建 FSRS 复习卡片。
- **Due Spread**: 卡片复习时间分散策略 (立即 / 1天内 / 7天内)。

### Step 4: Execute (Bisect Insert)
- **Phase A**: 批量插入 (`error_questions`)
  - 使用 `calculateOptimalBatchSize` 动态计算批次 (通常 50-200)。
  - 若批次失败，触发 **Bisect Mode** (二分法) 递归查找坏行，确保好数据能入库。
- **Phase B**: 处理关联
  - 创建/匹配 `tags` 并写入 `error_question_tags`。
  - 创建 FSRS `cards` (如果配置开启)。
- **Phase C**: 结果反馈
  - 成功数、失败数、Tag 创建数、Card 创建数。
  - 失败详情下载 (保留 row 号)。

## 5. 性能与限制

- **Payload 控制**: 自动剔除 `undefined` 字段，减少网络包体积。
- **Batch Size**: 动态计算，约 0.9MB Payload 上限。
- **并发**: 前端串行执行 Batch，避免 `429 Too Many Requests`。
