# V2 迁移路线图与功能迭代策略

> **来源**: 整合自 `docs/MIGRATION_STRATEGY.md` 与 `docs/REFACTOR_V5_DETAILED_DESIGN.md`
> **版本**: V5.9 (Production Hardened)

---

## 1. 现状调研与差距分析 (Gap Analysis)

V5 引入了 **"资产分离"** 与 **"后端计算"** 核心变更，与旧版架构存在重大差异：

| 维度 | 现有实现 (Legacy) | 目标架构 (V5.9) | 冲突等级 |
|:---|:---|:---|:---|
| **复习算法** | 前端计算 (SM-2) | 后端 Rust 计算 (FSRS v5) + RPC 存储 | 🔴 Critical |
| **数据模型** | 单体耦合 (`ErrorQuestion` 含学习状态) | 分离解耦 (`Asset` vs `Card`) | 🔴 Critical |
| **安全审计** | 隐式权限 | 显式审计 + 物理不可变性 | 🟠 High |
| **实体管理** | 物理删除 | 软删除 + 合并 + 撤销 | 🟡 Medium |

---

## 2. 迭代策略：Backend First, Frontend Adapt

采用渐进式策略，在不破坏现有功能的前提下完成进化。

### Phase 1: 基础设施 (The Bedrock) ✅

**目标**: 数据库升级到 V5.9，建立技术栈基础

| 任务 | 状态 | 说明 |
|:---|:---|:---|
| Schema V5.9 部署 | ✅ | `schema_full.sql` 完成 |
| Realtime Layer 部署 | ✅ | `realtime_full.sql` 完成 |
| Monorepo 初始化 | ✅ | Bun Workspaces |
| 契约同步 | ✅ | `supabase gen types` |
| Rust FFI 桥接 | 🔄 | `fsrs-engine` 编译中 |

### Phase 2: 复习核心 (The Pipeline) 🎯 当前阶段

**目标**: 复习纵切跑通

| 任务 | 状态 | 验收条件 |
|:---|:---|:---|
| Elysia API 网关 | 🔄 | 集成 `POST /review/card` |
| Rust FSRS 计算 | 🔄 | FFI wrapper 测试通过 |
| `submit_review` RPC | ✅ | 原子事务 + 幂等性 |
| Today View UI | 🔄 | `v_due_cards` 渲染 |
| Review Session UI | 🔄 | Rating 1-4 交互 |

**验收清单**:
- [ ] Rust fsrs-rs 集成 + Bun FFI wrapper
- [ ] 前端 Review UI 只负责展示/收 rating（无本地计算）
- [ ] Elysia 调用 Rust 计算 → 调用 DB RPC 存储
- [ ] 事务保证：写 `review_logs` + 更新 `cards` 原子完成
- [ ] RLS 攻击测试：2 个用户互相尝试越权（必须失败）
- [ ] 幂等性测试：重复 `client_request_id` 返回缓存

### Phase 3: 数据聚合 (Analytics) 🟠 P1

**目标**: 仪表盘与学习统计

| 任务 | 验收条件 |
|:---|:---|
| `user_dashboard_pulse` 集成 | 复习后即时更新 streak/count |
| Dashboard UI | 80% 需求由 SQL/视图满足 |
| 性能优化 | 页面加载 < 500ms (P95) |

### Phase 4: 导入系统 (Hyper Import) 🟠 P1

**目标**: 生产级导入队列

| 任务 | 验收条件 |
|:---|:---|
| `import_jobs` 状态机 | 支持重试、断点续传 |
| Worker 抢占 | `claim_import_job` 正常工作 |
| 错误追踪 | 失败可定位到具体行号 |
| 大文件测试 | 50MB Excel 导入成功率 > 99% |

### Phase 5: 高级管理 (Management) 🟢 P2

**目标**: 合并撤销与安全硬化

| 任务 | 验收条件 |
|:---|:---|
| 管理 UI | 接入 `merge_*` / `undo_*` |
| 后悔药机制 | Toast 撤销功能 |
| 旧路径封堵 | 移除前端本地计算逻辑 |

### Phase 6: AI 赋能 (AI Copilot) 🟡 P2

**目标**: 智能录入与语义检索

| 能力 | 实现 |
|:---|:---|
| 零成本录入 | 多模态 AI 解析图片/PDF |
| 语义检索 | pgvector Embedding |
| 智能标签建议 | 向量相似度计算 |

---

## 3. 数据所有权不变量

所有阶段必须遵守的安全规则：

| 资产类型 | 所有权规则 | 强制层 |
|:---|:---|:---|
| 公共题目 `user_id IS NULL` | 可读，不可写 | RLS |
| 私有题目 `user_id = me` | 可读写 | RLS |
| 卡片 `cards.user_id NOT NULL` | **永远私有** | RLS + 触发器 |
| 复习日志 `review_logs` | 私有 + 不可变 | RLS + 触发器 |

**安全硬化规则**:
- ✅ 所有 View 使用 `security_invoker = true`
- ✅ 所有 `SECURITY DEFINER` 函数设置 `search_path = pg_catalog, public`
- ✅ 可见性校验在 RLS/触发器/函数边界闭环

---

## 4. 风险与回滚方案

| 风险 | 缓解措施 | 回滚方案 |
|:---|:---|:---|
| FSRS 调度不合理 | 黄金测试集 + 灰度发布 | 按 `algo_version` 回退 |
| 并发复习丢数据 | `FOR UPDATE` 锁 | N/A (预防性) |
| 网络重试重复提交 | `client_request_id` 幂等 | N/A (预防性) |
| 导入大文件失败 | Job Queue + 断点续传 | 原文件保留在 Storage |
| RLS 绕过 | 安全测试矩阵 | 紧急关闭相关 API |

---

## 5. 功能迭代清单 (Action Items)

### P0 (必须完成 - 阻塞上线)

- [x] **DB**: V5.9 Schema 迁移完成
- [x] **DB**: Realtime Layer 部署完成
- [ ] **Types**: 运行 `supabase gen types` 生成新类型定义
- [ ] **Logic**: 禁用前端 SM2 计算，接入后端 FSRS 接口
- [ ] **Component**: Today 页面 + Review Session 完成

### P1 (体验提升)

- [ ] **UX**: 题型切换器（录入时动态切换 JSON 模板）
- [ ] **UX**: 复习界面 `notes` 和 `last_wrong_answer` 编辑入口
- [ ] **Perf**: `v_due_cards` 视图前端缓存策略
- [ ] **Import**: 导入中心 UI

### P2 (未来规划)

- [ ] **Exam**: 组卷中心，利用 `exam_records` 支持在线模考
- [ ] **Social**: 题库广场，利用 Fork 机制实现题目分享
- [ ] **AI**: 智能录入通道 + 语义检索

---

## 6. 里程碑验收制

> **原则**: 用验收条件替代时间估算（时间会骗人，验收不会）

### Milestone 1: 复习纵切跑通 🎯 当前

```
导入一道题 → 加入复习卡片 → 完成一次复习 → 看到下次到期
```

### Milestone 2: 数据聚合可用

```
仪表盘统计 → 学习曲线 → 连续天数
```

### Milestone 3: 导入系统

```
上传文件 → 异步解析 → 断点续传 → 错误追踪
```

### Milestone 4: 算法切换

```
SM2 验证 → FSRS 灰度 → 全量切换 → 回滚机制
```
