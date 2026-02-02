# FSRS 集成指南

> 基于 Context7 文档和项目架构的 FSRS v5 集成方案

## 一、FSRS 核心概念

### 1.1 什么是 FSRS？

**FSRS (Free Spaced Repetition Scheduler)** 是一个现代化的间隔重复算法，用于优化学习卡片的复习调度。

**核心优势：**
- 基于机器学习的参数优化
- 比传统 SM-2 算法更精确
- 支持个性化权重配置
- 开源且活跃维护

### 1.2 核心数据结构

#### Card（卡片状态）
```typescript
type Card = {
    due: Date;             // 下次复习日期
    stability: number;      // 记忆稳定性 (0.4+)
    difficulty: number;     // 卡片难度 (1-10)
    elapsed_days: number;   // 自上次复习以来的天数
    scheduled_days: number; // 下次复习的间隔天数
    learning_steps: number; // 当前学习步骤
    reps: number;          // 总复习次数
    lapses: number;        // 遗忘次数
    state: State;          // 状态: New(0), Learning(1), Review(2), Relearning(3)
    last_review?: Date;    // 最近复习日期
};
```

#### Rating（评分）
```typescript
enum Rating {
    Again = 1,  // 重来 - 完全忘记
    Hard = 2,   // 困难 - 需要努力回忆
    Good = 3,   // 良好 - 正常回忆
    Easy = 4    // 容易 - 轻松回忆
}
```

#### Memory（内存状态）
Rust 版本使用 `Memory` 对象来保存卡片的内部状态，包含：
- `stability`: 稳定性
- `difficulty`: 难度
- `state`: 状态
- `last_review`: 上次复习时间

### 1.3 FSRS 工作流程

```
用户复习卡片
    ↓
选择评分 (1-4)
    ↓
FSRS 算法计算
    ↓
更新 Card 状态
    ↓
保存 ReviewLog
    ↓
更新下次复习日期
```

## 二、项目中的 FSRS 集成

### 2.1 数据库设计

项目已经完整实现了 FSRS 的数据模型：

#### `cards` 表
```sql
CREATE TABLE public.cards (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    question_id UUID NOT NULL,
    
    -- FSRS 核心字段
    state SMALLINT NOT NULL DEFAULT 0,           -- 0-3
    stability DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 5,
    lapses INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    last_review TIMESTAMPTZ,
    due TIMESTAMPTZ NOT NULL DEFAULT now(),
    elapsed_days INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    
    -- 其他字段...
);
```

#### `review_logs` 表
记录每次复习的完整信息，用于分析和回滚。

#### `fsrs_configs` 表
内容寻址存储，保存权重配置的哈希和完整参数。

#### `review_settings` 表
用户个性化设置，包含：
- `request_retention`: 目标保留率 (默认 0.9)
- `maximum_interval`: 最大间隔 (默认 365 天)
- `weights`: FSRS 权重数组 (21 个参数)

### 2.2 Rust 实现方案

#### 方案 A: 使用 `fsrs-rs` crate（推荐）

**Cargo.toml:**
```toml
[package]
name = "fsrs-engine"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
fsrs = "0.5"  # 或最新版本
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
lto = true
opt-level = 3
codegen-units = 1
panic = 'abort'
```

**lib.rs 实现:**
```rust
use fsrs::FSRS;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CardState {
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub due: i64,  // Unix timestamp
    pub scheduled_days: i32,
    pub elapsed_days: i32,
    pub reps: i32,
    pub lapses: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Memory {
    pub stability: f64,
    pub difficulty: f64,
    pub state: u8,
    pub last_review: i64,
}

#[no_mangle]
pub extern "C" fn calculate_review(
    memory_json: *const i8,
    rating: i32,
    elapsed_days: i32,
    optimal_retention: f64,
    weights_json: *const i8,
) -> *mut i8 {
    // 解析输入
    let memory_str = unsafe { std::ffi::CStr::from_ptr(memory_json).to_str().unwrap() };
    let weights_str = unsafe { std::ffi::CStr::from_ptr(weights_json).to_str().unwrap() };
    
    let memory: Option<Memory> = if memory_str.is_empty() {
        None
    } else {
        serde_json::from_str(memory_str).ok()
    };
    
    let weights: Option<Vec<f64>> = if weights_str.is_empty() {
        None
    } else {
        serde_json::from_str(weights_str).ok()
    };
    
    // 初始化 FSRS
    let fsrs = FSRS::new(weights.as_deref()).unwrap();
    
    // 计算下一个状态
    let memory_state = memory.map(|m| fsrs::Memory {
        stability: m.stability,
        difficulty: m.difficulty,
        state: m.state,
        last_review: m.last_review,
    });
    
    let next_states = fsrs.next_states(memory_state.as_ref(), optimal_retention, elapsed_days).unwrap();
    
    // 根据 rating 选择对应的状态
    let result = match rating {
        1 => &next_states.again,
        2 => &next_states.hard,
        3 => &next_states.good,
        4 => &next_states.easy,
        _ => &next_states.good,
    };
    
    // 构造返回结果
    let card_state = CardState {
        state: result.memory.state,
        stability: result.memory.stability,
        difficulty: result.memory.difficulty,
        due: result.memory.last_review + (result.scheduled_days as i64 * 86400),
        scheduled_days: result.scheduled_days,
        elapsed_days,
        reps: if memory.is_none() { 1 } else { memory.unwrap().reps + 1 },
        lapses: if rating == 1 { 1 } else { 0 },
    };
    
    // 返回 JSON 字符串
    let json = serde_json::to_string(&card_state).unwrap();
    let c_string = std::ffi::CString::new(json).unwrap();
    c_string.into_raw()
}

#[no_mangle]
pub extern "C" fn free_string(ptr: *mut i8) {
    unsafe {
        if !ptr.is_null() {
            let _ = std::ffi::CString::from_raw(ptr);
        }
    }
}
```

#### 方案 B: 简化 FFI 接口

如果 `fsrs-rs` 的 API 复杂，可以封装一个更简单的接口：

```rust
#[no_mangle]
pub extern "C" fn fsrs_calculate(
    // 输入
    stability: f64,
    difficulty: f64,
    state: u8,
    rating: i32,
    elapsed_days: i32,
    optimal_retention: f64,
    // 输出指针
    out_stability: *mut f64,
    out_difficulty: *mut f64,
    out_state: *mut u8,
    out_scheduled_days: *mut i32,
) -> i32 {
    // 实现 FSRS 计算逻辑
    // ...
    0  // 成功返回 0
}
```

### 2.3 Bun FFI 包装

**ffi.ts:**
```typescript
import { dlopen, FFIType, suffix } from 'bun:ffi'
import { join } from 'node:path'

const libPath = join(import.meta.dir, `target/release/libfsrs_engine.${suffix}`)

export const { symbols: fsrs } = dlopen(libPath, {
    calculate_review: {
        args: [FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.f64, FFIType.ptr],
        returns: FFIType.ptr
    },
    free_string: {
        args: [FFIType.ptr],
        returns: FFIType.void
    }
})

// 类型定义
export interface CardState {
    state: number
    stability: number
    difficulty: number
    due: number  // Unix timestamp
    scheduled_days: number
    elapsed_days: number
    reps: number
    lapses: number
}

export interface Memory {
    stability: number
    difficulty: number
    state: number
    last_review: number
}

// 辅助函数
export function calculateReview(
    memory: Memory | null,
    rating: 1 | 2 | 3 | 4,
    elapsedDays: number,
    optimalRetention: number = 0.9,
    weights?: number[]
): CardState {
    const memoryJson = memory ? JSON.stringify(memory) : ''
    const weightsJson = weights ? JSON.stringify(weights) : ''
    
    const memoryPtr = Buffer.from(memoryJson + '\0').buffer
    const weightsPtr = Buffer.from(weightsJson + '\0').buffer
    
    const resultPtr = fsrs.calculate_review(
        memoryPtr,
        rating,
        elapsedDays,
        optimalRetention,
        weightsPtr
    )
    
    const resultStr = new TextDecoder().decode(
        new Uint8Array(resultPtr as any)
    )
    
    fsrs.free_string(resultPtr)
    
    return JSON.parse(resultStr) as CardState
}
```

### 2.4 Elysia API 集成

**apps/server/src/index.ts:**
```typescript
import { Elysia, t } from 'elysia'
import { calculateReview } from '@v2/fsrs'
import { supabase } from './supabase'

app.group('/api/v1', app => app
    .post('/review/submit', async ({ body, headers }) => {
        const userId = headers['x-user-id'] // 从 JWT 解析
        const { cardId, rating, durationMs } = body
        
        // 1. 获取卡片当前状态
        const { data: card, error: cardError } = await supabase
            .from('cards')
            .select('*')
            .eq('id', cardId)
            .eq('user_id', userId)
            .single()
        
        if (cardError || !card) {
            throw new Error('Card not found')
        }
        
        // 2. 获取用户设置
        const { data: settings } = await supabase
            .from('review_settings')
            .select('request_retention, weights')
            .eq('user_id', userId)
            .single()
        
        const optimalRetention = settings?.request_retention ?? 0.9
        const weights = settings?.weights as number[] | undefined
        
        // 3. 计算 elapsed_days
        const now = new Date()
        const lastReview = card.last_review ? new Date(card.last_review) : new Date(card.created_at)
        const elapsedDays = Math.floor((now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24))
        
        // 4. 调用 FSRS 计算
        const memory = card.last_review ? {
            stability: card.stability,
            difficulty: card.difficulty,
            state: card.state,
            last_review: Math.floor(lastReview.getTime() / 1000)
        } : null
        
        const result = calculateReview(
            memory,
            rating as 1 | 2 | 3 | 4,
            elapsedDays,
            optimalRetention,
            weights
        )
        
        // 5. 调用数据库 RPC
        const { data, error } = await supabase.rpc('submit_review', {
            p_user_id: userId,
            p_card_id: cardId,
            p_rating: rating,
            p_new_state: result.state,
            p_new_stability: result.stability,
            p_new_difficulty: result.difficulty,
            p_new_due: new Date(result.due * 1000).toISOString(),
            p_scheduled_days: result.scheduled_days,
            p_duration_ms: durationMs,
            p_algo_version: 'fsrs_v5',
            p_weights: weights,
            p_client_request_id: body.clientRequestId
        })
        
        if (error) throw error
        
        return data
    }, {
        body: t.Object({
            cardId: t.String(),
            rating: t.Number({ minimum: 1, maximum: 4 }),
            durationMs: t.Optional(t.Number()),
            clientRequestId: t.Optional(t.String())
        })
    })
)
```

### 2.5 前端集成

**ReviewSession.tsx 更新:**
```typescript
const handleRate = async (rating: number) => {
    const startTime = Date.now()
    
    try {
        const response = await api.review.submit.post({
            cardId: currentCard.card_id,
            rating,
            durationMs: Date.now() - startTime,
            clientRequestId: crypto.randomUUID()
        })
        
        // 更新本地状态
        // ...
        
        // 切换到下一张卡片
        setShowAnswer(false)
        setCurrentIndex((prev) => prev + 1)
    } catch (error) {
        console.error('Review submission failed:', error)
        // 显示错误提示
    }
}
```

## 三、实施步骤

### Phase 1: Rust 实现（1-2 天）
1. ✅ 添加 `fsrs` crate 依赖
2. ✅ 实现 FFI 接口
3. ✅ 编译测试

### Phase 2: Bun FFI 包装（半天）
1. ✅ 更新 `ffi.ts`
2. ✅ 添加类型定义
3. ✅ 编写测试

### Phase 3: 后端 API（1 天）
1. ✅ 实现 `/review/submit` 端点
2. ✅ 集成数据库查询
3. ✅ 错误处理

### Phase 4: 前端集成（半天）
1. ✅ 更新 `ReviewSession`
2. ✅ 添加错误处理
3. ✅ 端到端测试

## 四、关键注意事项

### 4.1 性能优化
- Rust 编译使用 `lto = true` 和 `opt-level = 3`
- 考虑缓存 FSRS 实例（如果支持）
- 批量处理多个卡片时复用权重配置

### 4.2 错误处理
- FFI 调用需要处理内存泄漏
- 数据库事务确保原子性
- 幂等性保证（`client_request_id`）

### 4.3 测试策略
- 单元测试：Rust FFI 函数
- 集成测试：Elysia API 端点
- 端到端测试：完整复习流程

### 4.4 迁移考虑
- 现有 SM-2 卡片需要迁移到 FSRS
- 提供迁移工具和验证
- 支持回滚机制

## 五、参考资源

- [fsrs-rs GitHub](https://github.com/open-spaced-repetition/fsrs-rs)
- [ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs)
- [FSRS 算法文档](https://github.com/open-spaced-repetition/fsrs4anki)
- [Bun FFI 文档](https://bun.sh/docs/runtime/ffi)

