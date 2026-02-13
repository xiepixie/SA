# SmartArchive 全局笔记本 Notebook — 需求规格与详细开发计划书（Final）

> 目标：在现有 **Question Jot**（题目便签）体系上，新增 **Global Note**（全局笔记）与 **NotebookPage /notebook**，实现 Obsidian-lite 的“长期笔记 + 双向链接 + 自动保存 + 文件夹树”体验，并与题目复习流无缝互通。

---

## 1. 背景与目标

### 1.1 背景

* 你已完成 Question Jot：在复习题目场景下“低干扰快速记录”。
* 仍缺少用户进行“系统性整理、跨题串联、长期沉淀”的空间（全局笔记本）。

### 1.2 产品目标（MVP）

1. 提供 `/notebook` 独立笔记空间：文件夹树 + 笔记编辑 + 可选预览
2. 支持 Markdown + LaTeX + 代码块的长文写作
3. 支持 Wiki Link 双向链接：笔记↔笔记、笔记↔题目
4. 自动保存：两级保存（本地草稿 + 远端落库）
5. Backlinks 在题目复习页可反向查看“哪些全局笔记引用了此题”

### 1.3 非目标（本期不做）

* 图谱 Graph view、离线同步冲突自动合并（可 P2）
* 正文批量改写（重命名后更新正文显示文本）（可 P2/Phase 3）
* 高级内联渲染（编辑器内图片/公式 widget 全量 Obsidian 化）（可 P2）

---

## 2. 总体架构（页面与模块）

```
NotebookPage (/notebook)
├── NotesSidebar (left panel)
│   ├── Search bar（全局搜索）
│   ├── View toggle: Folders / Recents
│   ├── File tree（folder lazy-load）
│   ├── Backlinks 摘要（对当前 note）
│   └── Create note / folder / rename / delete / move
├── NoteEditor (center)
│   ├── Title bar（inline editable）
│   ├── NoteEditorCore（CodeMirror 6, always-editable）
│   │   Extensions:
│   │   - smartList / bracketPairing / markdown / latex
│   │   - wikiLink (hover underline + Ctrl/Cmd+Click nav)
│   │   - wikiLinkCompletion (search notes+questions)
│   │   - autoSave (2-tier: IDB L1 + Server L2)
│   └── Status bar（dirty/saving/saved/error + word count + shortcuts）
└── Preview panel (right, optional toggle)
    ├── MarkdownRenderer (live)
    └── Backlinks section（incoming references）
```

---

## 3. 笔记类型定义（Question Jot vs Global Note）

| 维度      | Question Jot（已完成）     | Global Note（新）                |
| ------- | --------------------- | ----------------------------- |
| DB type | QUESTION              | GLOBAL                        |
| 场景      | 复习单题的快速记录             | 主题整理、公式总结、跨题串联                |
| 编辑模式    | 双击进入编辑；Esc/点击外部保存     | 始终可编辑（无模式切换）                  |
| 保存      | 手动保存为主                | 自动保存（两级）+ 手动强制保存              |
| 标题      | 自动生成，弱曝光              | 用户可编辑、可重命名                    |
| 文件夹     | 不支持                   | 支持树形层级（parent_id + is_folder） |
| 引用      | 被动被引用                 | 主动引用（创建 [[links]]）            |
| 入口      | ReviewSession 面板 / 浮窗 | /notebook 独立页面                |

---

## 4. Wiki Link 规格（核心：确定性链接 + 渲染跟随）

### 4.1 语法规范（对齐 Obsidian 的 `[[target|display]]`）

Obsidian Wikilink 支持用竖线 `|` 自定义显示文本。

* **插入格式（确定性）：**

  * `[[q:<question_uuid>|<display_title>]]`
  * `[[n:<note_uuid>|<display_title>]]`
* **手动输入（非确定）：** `[[任意文本]]`（无 id）

> 说明：左侧是“目标 target”，右侧是“显示 display”。与 Obsidian 格式一致，有利于长期兼容与用户心智统一。

### 4.2 解析责任（混合方案）

#### A) 自动补全插入（100% 确定）

* 前端通过 `/notes/search?q=...&includeQuestions=true` 获取 `{id,title,type}`
* 用户选中后插入：`[[q:id|title]]` 或 `[[n:id|title]]`

#### B) 手动输入 `[[xxx]]`（尽量自动转为确定性）

在保存前（或输入停顿时）执行解析：

1. 若唯一匹配：自动改写为 `[[T:id|xxx]]`
2. 若多结果：弹选择器（避免静默选错）
3. 若无结果：保持 `[[xxx]]`，标记 unresolved（红色波浪线 + tooltip）

#### C) 保存落库

* 前端只对“带 id 的链接”构建 refs：`[[q:...|...]]` / `[[n:...|...]]`
* unresolved 不写入 refs（MVP），仅作为纯文本保留

### 4.3 渲染规则（MVP：渲染跟随最新标题）

* refs 表存 `target_question_id / target_note_id`（UUID 永不变）
* 渲染链接/Backlinks 时优先以 JOIN 获取最新标题显示（而不是正文里旧 display）
* 正文 `[[...|display]]` 暂不批量改写（Phase 3 再做“规范化重写”）

### 4.4 Ctrl/Cmd+Click 导航（编辑器内）

* 普通 click：光标定位（不跳转）
* Ctrl/Cmd + click：打开目标（note 或 question）
* hover：underline + tooltip（提示“Ctrl/Cmd+Click 打开”）

---

## 5. 引用表（note_references）与 ref_node_id 规则

### 5.1 ref_node_id：确定性 UUID v5（支持 UPSERT）

使用 name-based UUID（v5）保证同 namespace + name 字符串生成稳定 UUID。

**生成规则（建议最终版）：**

* `ref_node_id = uuidv5( source_note_id + ":" + target_type + ":" + target_id + ":" + target_part + ":" + target_anchor )`

> 必须把 `target_part / target_anchor` 纳入 hash：否则同一目标不同锚点会被折叠为同一引用，影响未来“跳到具体小节/块”的能力。

### 5.2 RPC / 保存时更新引用

* 采用 **UPSERT**：`ON CONFLICT (source_note_id, ref_node_id) DO UPDATE`
* 清理策略（MVP 选其一）：

  1. **全量重建**：先删 source_note_id 的全部 refs，再插入新 refs（实现简单）
  2. **差量 UPSERT + 删除缺失**：更复杂，但性能更好（可 P1）

---

## 6. 两级自动保存规格（P0 必须）

### 6.1 保存链路

```
User types → onChange
  ├─ L1: IDB 草稿写入（500ms debounce）
  │   └─ 抗崩溃/断网：永不“提前删除草稿”
  └─ L2: 远端保存（2s idle OR blur/switch-note flush）
      ├─ 提取 refs（只处理带 id 的 wikilink）
      ├─ PATCH/RPC 保存 content + plain_text + refs + title
      ├─ 成功：lastSavedAt、clear dirty
      └─ 失败：error 状态 + 60s 后重试（可退避）
```

### 6.2 UI 状态（三态）

* `Saving…`：远端保存中（L2）
* `Saved ✓ 15:32`：远端保存成功
* `Failed ✕`：远端失败（提示“将自动重试” + 允许手动重试）

### 6.3 草稿策略（重要）

* **不要在 onMutate 里 deleteDraft**（避免浏览器崩溃导致“草稿已删但远端未写入”）
* 推荐字段：`updatedAt / syncedAt / syncing / lastError`

---

## 7. NotebookPage UI 与交互规格

### 7.1 Sidebar：Folders / Recents

* 顶部：搜索框（debounce 300ms）
* Tab：📁 Folders / 🕐 Recents
* Folders：懒加载

  * 初次：`GET /notes?type=GLOBAL&parentId=null`
  * 展开：`GET /notes?type=GLOBAL&parentId=<folderId>`
* Recents：

  * MVP 可客户端排序 `updated_at DESC`
  * 更推荐服务端支持排序+limit（减少全量拉取）

### 7.2 基本操作

* 新建笔记：在当前文件夹下创建 `GLOBAL`，标题默认“无标题”，创建后自动选中并聚焦标题
* 新建文件夹：`is_folder=true`
* 重命名：inline（Enter 提交、Esc 取消）
* 删除：确认弹窗；删除 folder 需明确策略（阻止 / 递归 / 移动到回收站）
* 移动：拖拽或 Move 菜单 (P1)

### 7.3 Editor 与 Preview

* 中栏：始终可编辑（NoteEditorCore）
* 右栏：Preview 可切换（默认可关）
* Backlinks：

  * 在 Preview 或 Sidebar 底部展示 incoming references
  * 点击可跳转到来源笔记（/notebook?noteId=xxx）

---

## 8. 数据与 API 规格

### 8.1 数据表（沿用现有）

* `notes`：支持 `QUESTION/GLOBAL`、folder 树、content JSONB、plain_text 搜索
* `note_references`：source_note_id → target_note_id / target_question_id + anchor/part/mode

### 8.2 必新增端点（P0/P1）

#### A) `GET /notes/search`

**用途：** wikiLinkCompletion 统一搜索（笔记 + 题目）

* Query:

  * `q: string`
  * `limit?: number = 10`
  * `includeQuestions?: boolean = true`
* Response:

```json
{
  "results": [
    { "type": "note", "id": "uuid", "title": "傅里叶级数总结", "snippet": "..." },
    { "type": "question", "id": "uuid", "title": "傅里叶展开题", "snippet": "..." }
  ]
}
```

#### B) `PATCH /notes/:id/move`（P1）

* Body: `{ parentId: uuid|null }`
* 校验：parent 必须是 folder；避免循环引用；更新 updated_at

---

## 9. 前端工程结构与关键模块

### 9.1 新增文件

```
pages/
└── NotebookPage.tsx

features/notes/components/
├── NotesSidebar.tsx
├── NoteEditor.tsx
├── NoteEditorToolbar.tsx        (P1)
└── BacklinksList.tsx            (增强：点击导航)

features/notes/editor/
├── NoteEditorCore.tsx
└── extensions/
    ├── wikiLink.ts
    ├── wikiLinkCompletion.ts
    ├── autoSave.ts
    └── unresolvedLink.ts         (可合并进 wikiLink)

features/notes/hooks/
└── useNoteEditor.ts
```

---

## 10. CodeMirror 6 实现要点

### 10.1 Decorations / ViewPlugin

* wikiLink hover underline、unresolved 红色波浪线、Ctrl/Cmd+Click 行为建议用 ViewPlugin + Decorations 实现
* CodeMirror 对“会改变垂直布局的 widget/块级装饰”有直接装饰的要求，需注意性能与 viewport 计算。

---

## 11. 开发阶段与任务拆解

### Phase 1（P0 — Core MVP，已基本完成）

1. 路由与入口：`/notebook` 路由 + 侧边栏入口
2. NotebookPage 三栏布局：Sidebar / Editor / Preview
3. NotesSidebar：folder 懒加载、新建 note/folder、重命名、删除
4. NoteEditorCore：markdown + wikiLink (Completion & Nav)
5. autoSave：L1 IDB + L2 Server
6. refs 生成与 RPC 集成
7. BacklinksList：反向查看与跳转

---

### Phase 2（P1 — 体验打磨，正在进行）

1. Preview 分屏默认体验优化（渲染 debounce)
2. NoteEditorToolbar（加粗/标题/列表/代码/LaTeX 快捷）
3. Move：`PATCH /notes/:id/move` + UI
4. i18n 文案补齐
5. 快捷键：Ctrl/Cmd+S 强制 flush；Ctrl/Cmd+N 新建笔记

---

## 12. 风险清单与应对

1. **同名/重命名导致解析错链**：通过 `[[type:id|display]]` 锚定 UUID（根治）
2. **自动保存频繁请求**：两级保存分流，并在切换/blur 强制 flush
3. **缓存回滚/闪烁**：使用 TanStack Query 乐观更新 + setQueryData
