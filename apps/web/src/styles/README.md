# CSS 架构指南

> Smart Error Archiver v2 Design System

本文档描述了项目的 CSS 模块化架构，指导后续页面开发和样式维护工作。

---

## 📁 目录结构

```
src/styles/
├── app.css                    # 🎯 入口点（唯一被 main.tsx 导入）
├── framework.css              # 🔧 框架层（Tailwind + daisyUI）
├── themes.css                 # 🎨 主题特定变量（玻璃物理）
├── tokens.css                 # 📐 设计令牌（运动、间距、z-index）
├── base.css                   # 🏗️ 基础样式（重置、排版、a11y）
├── utilities.css              # ⚡ 原子工具类（se-* 系列）
├── overrides.css              # 🔧 最终覆盖（严格管控）
├── README.md                  # 📖 本文档
└── components/
    ├── index.css              # 组件导入聚合
    └── *.css                  # 各组件样式文件
```

---

## 🌐 浏览器兼容性

### 目标浏览器
- Chrome 111+
- Safari 16.4+
- Firefox 113+
- Edge 111+

### 使用的现代 CSS 特性
| 特性 | 用途 | 兼容性说明 |
|------|------|------------|
| `oklch()` | 色彩空间 | 所有目标浏览器支持 |
| `oklch(from ...)` | 相对颜色 | CSS Color Level 5，已提供 fallback |
| `backdrop-filter` | 玻璃效果 | 广泛支持，有 `-webkit-` 前缀 |
| `100dvh` | 动态视口 | 所有目标浏览器支持 |

### OKLCH Fallback 策略
```css
/* 先写普通值作为 fallback */
--glass-border-hover: oklch(70% 0.15 140 / 0.55);
/* 再写相对颜色覆盖（支持的浏览器会使用这个） */
--glass-border-hover: oklch(from var(--color-primary) l c h / 0.55);
```

---

## 🏛️ 架构原则

### 1. 单一入口点
- **只有 `app.css`** 被 `main.tsx` 导入
- 所有其他文件通过 `@import` 链式导入

### 2. 框架层分离
```css
/* app.css */
@import "./framework.css";    /* 1. 框架先加载 */
@import "./themes.css";       /* 2. 自定义样式后加载（可覆盖框架） */
/* ... */
```

### 3. 主题定义集中
- 主题默认/偏好设置**只在 `framework.css` 的 themes 列表**中定义
- `color-scheme` 在 `@plugin "daisyui/theme"` block 中声明
- 不要在多处重复定义默认来源

### 4. 命名空间
- 所有自定义选择器必须以 `.sea` 为前缀
- 例如：`.sea .sidebar`、`.sea .glass-card`

---

## 📋 文件职责说明

| 文件 | 职责 | 何时修改 |
|------|------|----------|
| `app.css` | 入口点、导入顺序 | 添加新的顶级模块 |
| `framework.css` | Tailwind + daisyUI 主题定义 | 添加新主题、修改主题颜色 |
| `themes.css` | 玻璃物理变量、主题覆盖 | 调整玻璃效果、性能模式 |
| `tokens.css` | 设计令牌 | 添加新的运动/间距/颜色语义 |
| `base.css` | 全局重置、排版、a11y | 修改默认字体、焦点环 |
| `utilities.css` | 原子工具类 | 添加可复用动画/工具 |
| `overrides.css` | **严格管控** | 仅限第三方补丁 |

---

## 🖼️ 玻璃效果分层

针对"错题管理复习"场景，玻璃效果按用途分层：

### Chrome（装饰层）- 强玻璃
- 侧边栏、浮层、弹窗、顶部工具条
- 使用 `--glass-bg`

### Reading（阅读层）- 稳底
- 题干、解析、笔记、错因总结
- 使用 `--glass-bg-reading`（更不透明、更稳定）

```css
/* 阅读卡片使用更稳的玻璃 */
.sea .question-card {
    background-color: var(--glass-bg-reading);
}
```

### 性能模式
| 模式 | 用途 | 效果 |
|------|------|------|
| `data-perf="hi"` | 高性能设备 | 增强 blur/sat |
| 默认 | 常规 | 平衡效果 |
| `data-perf="lite"` | 移动端/低配 | 关闭 blur、减阴影 |

---

## ⚠️ 硬约束规则

### 约束 A：`overrides.css` 准入规则

**只允许放入以下内容：**
1. 第三方库样式补丁
2. 紧急 hotfix（必须标注）

**每条覆盖必须包含注释：**
- TARGET: 被覆盖的组件/库
- REASON: 为什么需要覆盖
- ISSUE: 相关 issue 编号
- PLAN: 何时/如何移除

**清理周期**：每周/每迭代审查一次。

---

### 约束 B：文件边界规则（防耦合）

**✅ 允许**：只命中该组件根节点
```css
.sea .sidebar { ... }
.sea .sidebar-header { ... }
```

**❌ 禁止**：跨组件选择器
```css
.sea .sidebar .btn { ... }  /* 侵入按钮体系 */
```

**状态管理**：只使用 `data-*` / `aria-*` 属性
```css
/* ✅ 推荐 */
.sea .q-row[data-state="overdue"] { ... }

/* ❌ 避免 */
.sea .q-row.is-overdue { ... }
```

---

### 约束 C：Accent 切换必须完整

修改 `--color-primary` 时，**必须同时提供 `--color-primary-content`**：
```css
.sea[data-accent="magenta"] {
    --color-primary: #D90368;
    --color-primary-content: #fef1f6; /* 必须！保证对比度 */
}
```

---

## 🚀 常见开发场景

### 场景 1：添加新页面组件

1. 创建 `components/review-session.css`
2. 编写样式（使用 `.sea` 命名空间）
3. 在 `components/index.css` 中导入

### 场景 2：添加新主题

1. 在 `framework.css` 的 `@plugin "daisyui"` themes 列表中注册
2. 添加 `@plugin "daisyui/theme"` block 定义颜色
3. 在 `themes.css` 中添加玻璃物理效果

### 场景 3：阅读区需要更稳的底色

```css
.sea .question-content {
    background-color: var(--glass-bg-reading);
}
```

### 场景 4：移动端性能优化

在根元素添加 `data-perf="lite"`：
```tsx
<html data-theme="liquid-dark" data-perf="lite">
```

---

## 🔮 未来改进：Cascade Layers（可选）

当项目继续增长，可以启用 CSS `@layer` 来管理覆盖优先级：

```css
@layer framework, theme, tokens, base, components, utilities, overrides;
```

**当前状态**：暂未启用，但架构已为此做好准备。

---

## 📊 加载顺序

```
1. Google Fonts
2. framework.css
   ├── Tailwind CSS
   └── daisyUI（主题）
3. themes.css     → 玻璃物理变量
4. tokens.css     → 设计令牌
5. base.css       → 全局重置
6. components/*.css → 组件样式
7. utilities.css  → 原子工具
8. overrides.css  → 最终覆盖
```

---

## ⚠️ 注意事项

### VS Code Lint 警告
- `Unknown at rule @plugin` 是正常的（Tailwind v4 语法）
- 不影响构建和运行

### 主题定义单一来源
- 默认主题只在 `framework.css` 的 themes 列表中用 `--default` 标记
- 不要在 theme block 中重复写 `default: true`

---

## 🔗 相关资源

- [Tailwind CSS v4 文档](https://tailwindcss.com/docs)
- [daisyUI 文档](https://daisyui.com/)
- [CSS Cascade Layers (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)
- [OKLCH 颜色空间](https://oklch.com/)
- [CSS 相对颜色语法](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch#relative_colors)

---

*最后更新: 2025-12-27*
