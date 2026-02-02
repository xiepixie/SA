# Markdown CSS 三层架构快速参考

## 🎯 使用指南

### Reading Mode (主区默认)
```tsx
// 自动应用：舒适阅读，65ch宽度控制
<MarkdownRenderer content={question} />
```

**特点:**
- ✅ 行宽限制65ch（避免行过长）
- ✅ 舒适行高1.75
- ✅ HR有装饰点"✦"
- ✅ 长链接自动换行

**适用场景:**
- 题目主区
- 解析详情
- 长笔记阅读

---

### Scanning Mode (侧栏紧凑)
```tsx
// 显式指定：信息密度优先
<MarkdownRenderer content={note} density="compact" />
```

**特点:**
- ✅ 无宽度限制（利用全部空间）
- ✅ 紧凑行高1.45
- ✅ 所有间距收紧50%
- ✅ HR装饰移除（降噪）

**适用场景:**
- 侧边栏笔记预览
- 题目列表
- 卡片组件

---

### Interaction Layer (自动)
**自动应用于所有交互元素:**

| 元素 | 交互触发 | 行为 |
|-----|---------|------|
| **Anchor Link** | 标题hover | 淡入锚点（不hover时完全不可点） |
| **Anchor Link** | Tab聚焦 | 2px蓝色outline |
| **Table Wrapper** | 窄屏 | 横向滚动 |
| **Task Checkbox** | 点击 | 无反应（只读渲染器） |
| **HR装饰** | Compact模式 | 自动隐藏 |

---

## 🎨 主题扩展（CSS变量）

### 新增主题只需3步

**1. 定义变量（10行）**
```css
[data-theme="my-theme"] {
    --code-bg: #yourcolor;
    --code-fg: #yourcolor;
    --code-border: rgba(...);
    --code-shadow: 0 ...;
    --code-header-bg: rgba(...);
    --code-header-border: rgba(...);
    --code-lang-fg: rgba(...);
    --code-line-number: #yourcolor;
    --code-line-hover: rgba(...);
    --code-copy-bg: rgba(...);
    --code-copy-fg: #yourcolor;
    --code-copy-hover: rgba(...);
}
```

**2. 组件层无需修改** ✅

**3. 立即全局生效** 🚀

---

## 🐛 常见问题

### Q: 主区内容超过65ch怎么办？
A: 自动换行，长链接/代码不会撑爆布局（`overflow-wrap: break-word`）

### Q: 侧栏要限制宽度怎么办？
A: 在外层容器设置`max-width`，markdown-body不管容器宽度

### Q: Compact模式下HR为什么没装饰？
A: 侧栏扫描场景，装饰点会分散注意力，已自动移除

### Q: 任务列表Checkbox能点击吗？
A: 不能，渲染器是只读的，避免用户误操作（编辑器层才允许）

### Q: 锚点什么时候可见？
A: 
1. 鼠标悬浮标题时
2. 标题内有元素聚焦时
3. Tab键聚焦到锚点自身时

### Q: 新增主题要改多少行代码？
A: **10行变量定义**，组件层0改动

---

## 📊 性能对比

| 操作 | 旧架构 | 新架构 |
|-----|-------|-------|
| **新增主题** | 复制粘贴110+行 | 定义10行变量 |
| **修改代码块样式** | 修改6个主题各5处 | 修改1处组件样式 |
| **选择器复杂度** | `:not(.md-table-wrap table)` | `.md-table-wrap :where(table)` |
| **!important数量** | 12处 | 3处 |

---

## ✅ 验证清单

部署后检查：

```javascript
// 1. 主区max-width
document.querySelector('.markdown-body:not([data-density])').style.maxWidth 
// 应该是: "65ch"

// 2. Compact无max-width
document.querySelector('[data-density="compact"]').style.maxWidth 
// 应该是: "none"

// 3. 锚点不可见时不可点
const anchor = document.querySelector('.anchor-link');
anchor.style.pointerEvents  
// 应该是: "none"（不hover时）

// 4. Checkbox不可交互
document.querySelector('.task-list-item input').style.pointerEvents  
// 应该是: "none"
```

---

## 🎯 设计原则

1. **不可见 = 不可交互** （防止误触）
2. **Reading优先阅读舒适** （宽度控制）
3. **Scanning优先信息密度** （紧凑间距）
4. **Interaction低打扰反馈** （可发现但不干扰）
5. **主题100%解耦** （变量层 + 组件层）

---

**快速开始:** 无需配置，开箱即用  
**深度定制:** 修改CSS变量即可  
**问题排查:** 参考MARKDOWN_UX_REDESIGN.md
