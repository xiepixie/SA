# SmartArchive Web Architecture V2 (Mutation-Driven + Event-Driven FSM)

## 1. 目标与边界

### 解决的问题

1.  **副作用散乱**：请求、缓存、toast、跳转、埋点混在 UI 里。
2.  **流程碎片化**：step 跳转靠硬编码，不可控、不可测。
3.  **性能瓶颈**：对象/函数引用不稳定导致 memo 失效、重渲染扩散。

### 不解决的问题（明确边界）

*   **不**把 TanStack Query 当“全局状态管理器”（它负责 server state）。
*   **不**把 Zustand 当“页面流程状态机”（它负责真正跨树共享的 app state）。
*   **不**强行引入重型状态机库（如 XState）；优先用**事件驱动的轻量 FSM**。

---

## 2. 核心模型：两类状态 + 一个协调层

### 1) UI State（Wizard/FSM State）

*   **归属**：`useReducer`（纯函数状态机）
*   **内容**：step、selectedId、filters、UI toggles、表单输入、临时交互态等
*   **禁止**：在 reducer 里维护 `isLoading / error / data`（这属于 server state）

### 2) Server State（Server/Mutation State）

*   **API 契约 (MUST)**：无论后端框架如何，前端统一约定：**成功 resolve(data)，失败 throw(error)**。否则 TanStack Query 无法可靠触发 `onError` 或错误状态分支。
*   **生命周期约束 (TanStack Query v5)**：
    *   **Mutation 副作用**: 仍使用 `onSuccess/onError` 回调处理流程跳转。
    *   **Query 副作用**: v5 移除了 `useQuery` 回调。其副作用必须用 `useEffect` 监听 `status` 的**边沿变化**实现。
    ```tsx
    // ✅ Query side-effect template (v5)
    export function useDispatchOnQuerySuccess<TData>(query, dispatch, toEvent) {
      const prev = React.useRef(query.status);
      React.useEffect(() => {
        if (prev.current !== 'success' && query.status === 'success' && query.data != null) {
          dispatch(toEvent(query.data));
        }
        prev.current = query.status;
      }, [query.status, query.data, dispatch, toEvent]);
    }
    ```

### 3) Coordinator（页面协调器）

页面组件 (`[Feature]Page.tsx`) 是**协调者**而非实现者：
- **只做映射**：事实（Mutation 结果、路由参数、键盘事件）→ 发送 Event。
- **不做实现**：Toast 文案拼接、埋点字段构造、复杂缓存策略应下沉至切面 Hooks 或 Util 函数。

---

## 3. 四大支柱（团队规范版）

### A. 状态分离（MUST）
*   UI 状态只进 reducer；异步状态只看 mutation/query 生命周期。
*   严禁在 UI State 中重复建模 `loading/error`。

### B. 稳定性（MUST）
*   **选中态**：`selectedId` 必须是真实数据 ID，禁止 index。
*   **列表 key**：可变列表 key 必须来自数据 ID，禁止 index。

### C. 派生优于存储（SHOULD）
*   Reducer 只存 raw state（原始 items、用户选择、当前 step）。复杂业务统计、验证、过滤结果全部通过 Selectors 派生。
*   **性能策略 (2026 基线)**：默认相信 React/Compiler；手写 memo 只用于建立“稳定边界”（如：跨层 props identity、长列表 item renderer）。不要把 useMemo 当“优化开关”，而是当“架构分界工具”。

### D. 库/框架一致性契约
*   **失效驱动 (MUST)**：Mutation 成功后必须通过 QueryKey Factory 触发 `invalidateQueries`。
*   **时序同步 (SHOULD)**：只有当后续流程强依赖最新回填数据时，才 `await invalidateQueries`。

---

## 4. 关键护栏（Architectural Safeguards）

### 风险 1：流程语义模糊（onSettled 滥用）

**规则（MUST）**：`SUCCESS` 步由 `onSuccess` 触发，`ERROR` 步由 `onError` 触发。`onSettled` 仅用于解锁 UI 或埋点统计。

### 风险 2：Coordinator 沦为上帝组件 (God Component)

**规则（MUST）**：
- **Coordinator 只做映射**：事实（Mutation 结果、路由参数、键盘事件）→ 发送 Event。
- **不做实现**：Toast 文案拼接、埋点字段构造、复杂缓存策略应下沉至切面 Hooks 或 Util 函数。

### 风险 3：FSM 逻辑的随意性

**规则（MUST）**：reducer 只接受 **Event**。严禁直接 dispatch 目标状态字符串。

### 风险 4：ViewModel 巨大对象导致重渲染风险

**问题**：若 ViewModel 直接返回易变的大对象，会导致所有下游受控组件 `memo` 失效。
**加固 (MUST)**：
- ViewModel 返回对象必须分段 `useMemo`（Actions、Handlers、Selectors/ProcessedData 分离）。
- 子组件 Props 以 Primitive (基本类型) 或稳定的 Handler 引用为主。

---

## 5. API Client 层规范 (Elysia / Eden Treaty)

Eden Treaty 的返回 `{ data, error }` 不会自动抛错，必须处理以符合 TanStack Query 语义。

### 5.1 Unwrap & Reject 模式 (MUST)
Eden 返回 `{ data, error }`。在 `mutationFn` 中必须做解包，若 `error` 有值则必须 **throw**，否则 TanStack Query 的 `onError` 永远不会触发。

```ts
// modules/api/utils.ts
export async function unwrapEden<T>(promise: Promise<{ data: T | null; error: any }>): Promise<T> {
    const { data, error } = await promise;
    if (error) {
        // Eden 语义：>=300 时 data 一定是 null
        const apiError = new Error(error.value?.message || 'API Error');
        (apiError as any).code = error.value?.code;
        throw apiError; // 核心：抛出错误以触发 TanStack Query 的 onError
    }
    return data as T;
}
```

### 5.2 API 分层结构
1.  **modules/api/client.ts**: Eden 实例配置（Eden Treaty）。
2.  **modules/api/errors.ts**: 错误码与前端提示的映射映射。
3.  **modules/api/[domain].ts**: 定义纯函数（如 `export const getNotes = ...`），内部调用 `unwrapEden`。
4.  **feature/.../useMutation.ts**: 订阅 API 函数，此时 `onSuccess` 拿到的 data 保证不为 null。

---

## 6. Zustand 使用规范 (App State)

1.  **精确选择器**：严禁 `useStore()`，必须使用原子选择器。
2.  **强制 useShallow**：Zustand 官方推荐在返回对象/数组的选择器中配合 `useShallow` 避免 computed 结果引发无效渲染。
3.  **禁止存储派生状态**。

---

## 7. 命名与目录规范

### 7.1 文件结构 (MUST)
- `src/features/[feature]/[Feature]Page.tsx`: Coordinator (装配与映射)。
- `src/features/[feature]/components/[Feature]View.tsx`: 受控 View (只渲染)。
- `src/features/[feature]/hooks/use[Feature]Wizard.ts`: ViewModel (Reducer + Selectors + Handlers)。
- `src/shared/aspects/`: 跨 Feature 可复用的切面 Hooks。

### 7.2 QueryKey Factory (MUST)
```ts
// src/shared/queryKeys/notes.ts
export const notesKeys = {
  all: ['notes'] as const,
  byQuestion: (questionId: string) => [...notesKeys.all, 'byQuestion', questionId] as const,
};
```

---

## 8. Coordinator 切面 Hooks (Aspect Hooks)

### 8.1 命名规范 (MUST)
统一使用 `use<Effect>On<Trigger>` 格式：
- `useInvalidateOnSuccess(mutation, keys)`
- `useToastOnMutation(mutation, messages)`
- `useNavigateOnSuccess(mutation, to)`

### 8.2 边沿触发检测 (MUST)
必须使用 `ref` 记录 `status`，确保 Side Effects 只在状态变化的“这一瞬间”触发一次。**传入的 `keys` 必须稳定**（来自 Factory 或 useMemo）。

---

## 9. 实时同步策略 (Supabase Realtime)

### 9.1 原则 (MUST)
Realtime 事件只负责 **invalidate**，不要在回调里 patch 大对象。

### 9.2 选型规范
- **Broadcast/Presence** (推荐)：适用于高频、多人协作态 (Typing, Cursor)。高性能不走 DB WAL，具备规模化潜力。
- **Postgres Changes**：适用于低频持久化实体。随并发用户增长对 DB 压力更敏感。

---

## 总结

本架构的灵魂在于**“语义边界”**与**“身份稳定”**。通过 API 层控错、Mutation 控流、Selector 派生、Coordinator 映射，我们构建了一个即使在 React Compiler 时代也能保持极高健壮性与可读性的工程体系。
