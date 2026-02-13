import React, { useState, useEffect, useRef, useCallback } from 'react';
import QuickJotEditor from '../features/notes/editor/QuickJotEditor';
import { useSearchParams, useLocation } from 'react-router-dom';
import { MarkdownRenderer, parse_content } from '../components/LatexRenderer';

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    React.useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

// 傅里叶级数展开示例
const FOURIER_EXAMPLE = `# 傅里叶级数展开

将 $f(x) = \\begin{cases} 1, & 1 < x < 2 \\\\ 3 - x, & 2 \\le x \\le 3 \\end{cases}$ 展开为以 2 为周期的傅里叶级数。

## 答案

$$\\dfrac{3}{4} + \\sum\\limits_{n=1}^{\\infty} \\left[ \\dfrac{1 - (-1)^n}{n^2\\pi^2} \\cos n\\pi x + \\dfrac{(-1)^n}{n\\pi} \\sin n\\pi x \\right]$$

## 分析

本题要求在区间 $[1,3]$ 上展开以 $T=2$ 为周期的傅里叶级数。周期 $2L=2 \\implies L=1$。

系数公式为：

$$a_n = \\frac{1}{L}\\int_1^3 f(x)\\cos\\frac{n\\pi x}{L}dx, \\quad b_n = \\frac{1}{L}\\int_1^3 f(x)\\sin\\frac{n\\pi x}{L}dx$$

## 推导

### 第一步：计算 $a_0$

$$\\begin{aligned} a_0 &= \\int_1^3 f(x) dx = \\int_1^2 1 dx + \\int_2^3 (3-x) dx \\\\ &= [x]_1^2 + \\left[ 3x - \\dfrac{x^2}{2} \\right]_2^3 \\\\ &= (2-1) + \\left[ (9 - 4.5) - (6 - 2) \\right] \\\\ &= 1 + 0.5 = \\dfrac{3}{2} \\end{aligned}$$

故常数项为 $\\dfrac{a_0}{2} = \\dfrac{3}{4}$。
`;

// 代码块交互测试
const CODE_BLOCK_EXAMPLE = `# 代码块交互测试

## IDE 级行选择功能

**操作说明：**
- 点击行号区域：切换单行选中
- Shift + 点击行号：范围选择
- 点击代码内容：设置活跃行
- Ctrl/Cmd + 点击：保持现有选择

### Python 示例

\`\`\`python
import numpy as np
from scipy import integrate

def fourier_coefficient(f, L, n, type='a'):
    """计算傅里叶系数 a_n 或 b_n"""
    if type == 'a':
        integrand = lambda x: f(x) * np.cos(n * np.pi * x / L)
    else:
        integrand = lambda x: f(x) * np.sin(n * np.pi * x / L)
    
    result, _ = integrate.quad(integrand, -L, L)
    return result / L

# 定义分段函数
def f(x):
    if 1 < x < 2:
        return 1
    elif 2 <= x <= 3:
        return 3 - x
    return 0

# 计算前10项系数
coefficients = [fourier_coefficient(f, 1, n) for n in range(10)]
print(coefficients)
\`\`\`

### TypeScript 示例

\`\`\`typescript
interface FourierCoefficients {
    a: number[];
    b: number[];
}

function calculateFourier(f: (x: number) => number, L: number, terms: number): FourierCoefficients {
    const a: number[] = [];
    const b: number[] = [];
    
    for (let n = 0; n <= terms; n++) {
        // 使用数值积分计算系数
        const aN = integrate(x => f(x) * Math.cos(n * Math.PI * x / L), -L, L) / L;
        const bN = integrate(x => f(x) * Math.sin(n * Math.PI * x / L), -L, L) / L;
        a.push(aN);
        b.push(bN);
    }
    
    return { a, b };
}

// 使用示例
const result = calculateFourier(x => x * x, 1, 10);
console.log('a_n:', result.a);
console.log('b_n:', result.b);
\`\`\`

### Rust 示例

\`\`\`rust
use std::f64::consts::PI;

fn fourier_series(x: f64, coeffs: &[(f64, f64)], l: f64) -> f64 {
    let mut sum = coeffs[0].0 / 2.0;
    
    for (n, (a_n, b_n)) in coeffs.iter().enumerate().skip(1) {
        let omega = (n as f64) * PI / l;
        sum += a_n * (omega * x).cos() + b_n * (omega * x).sin();
    }
    
    sum
}

fn main() {
    let coeffs = vec![(0.75, 0.0), (0.2, 0.1), (0.0, -0.05)];
    let result = fourier_series(1.5, &coeffs, 1.0);
    println!("f(1.5) ≈ {:.4}", result);
}
\`\`\`
`;

// 表格和混合内容测试
const TABLE_EXAMPLE = `# 表格与混合内容测试

## 傅里叶系数对照表

| n | a_n | b_n | 说明 |
|---|-----|-----|------|
| 0 | 3/4 | — | 常数项 |
| 1 | 2/π² | -1/π | 奇数项 |
| 2 | 0 | 1/2π | 偶数项 |
| 3 | 2/9π² | -1/3π | 奇数项 |

## 常见级数收敛表

| 级数类型 | 收敛条件 | 例子 |
|----------|----------|------|
| 幂级数 | x 小于 R | Σxⁿ |
| 傅里叶级数 | Dirichlet条件 | Σsin(nx) |
| Taylor 级数 | 解析区域内 | eˣ = Σxⁿ/n! |

> **注意**：由于 markdown-rs 的限制，表格内不支持 LaTeX 公式。公式请在表格外使用。

## 公式示例（表格外）

完整的数学表达式：

$$a_n = \\dfrac{2}{n^2\\pi^2}, \\quad b_n = \\dfrac{(-1)^n}{n\\pi}$$

## 嵌套公式测试

矩阵表示：

$$A = \\begin{pmatrix} a_{11} & a_{12} & \\cdots & a_{1n} \\\\ a_{21} & a_{22} & \\cdots & a_{2n} \\\\ \\vdots & \\vdots & \\ddots & \\vdots \\\\ a_{m1} & a_{m2} & \\cdots & a_{mn} \\end{pmatrix}$$

分段函数：

$$f(x) = \\begin{cases}\\displaystyle\\frac{x^2 - 1}{x - 1} & x \\neq 1 \\\\[1em]2 & x = 1\\end{cases}$$`;

// 边缘情况测试
const EDGE_CASES_EXAMPLE = `# 边缘情况测试

## 1. 转义字符

- 美元符号：\\$100 和 \\$200
- 变量表示：\\$HOME, \\$PATH
- 混合：价格是 \\$50，但公式是 $x + y = z$

## 2. 行内代码保护

代码中的美元符号 \`$HOME\` 和 \`price = $100\` 不应该被渲染为公式。

Shell 变量：\`echo $USER\`

## 3. 代码块中的公式注释

\`\`\`javascript
// 计算 $E = mc^2$ 的数值
const c = 299792458; // 光速 m/s
const m = 1; // 质量 kg
const E = m * c * c; // 能量 $E$

console.log(\`能量: \${E} J\`); // 模板字符串中的 $
\`\`\`

## 4. Unicode 和中文

积分公式：$\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}$

中文括号测试：（$a + b$）和【$c \\times d$】

## 5. 超长公式

$$\\lim_{n \\to \\infty} \\left( 1 + \\frac{1}{n} \\right)^n = e = \\sum_{k=0}^{\\infty} \\frac{1}{k!} = 1 + 1 + \\frac{1}{2!} + \\frac{1}{3!} + \\frac{1}{4!} + \\cdots \\approx 2.71828$$

## 6. 连续多个公式块

$$\\alpha + \\beta = \\gamma$$

$$\\sin^2\\theta + \\cos^2\\theta = 1$$

$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$$

## 7. 深链接锚点测试

点击下面的标题链接测试锚点跳转：

### 锚点A {#anchor-a}

这是锚点 A 的内容。

### 锚点B {#anchor-b}

这是锚点 B 的内容。

回到 [锚点A](#anchor-a)
`;

// 语义提示框测试 (Obsidian-style Callouts)
const CALLOUT_EXAMPLE = `# 语义提示框 Semantic Callouts

本页面展示了所有支持的 Callout 类型。使用 \`> [!type] Title\` 语法。

---

## 知识类（蓝色系）

> [!theory] 定理：泰勒展开
> 设 $f(x)$ 在 $x_0$ 处具有 $n$ 阶导数，则：
> $$f(x) = \\sum_{k=0}^n \\frac{f^{(k)}(x_0)}{k!}(x-x_0)^k + R_n(x)$$

> [!note] 备注
> 这是一个普通的备注框，适用于补充说明。

> [!info] 信息
> 提供重要的背景知识或上下文信息。

---

## 推理类（紫色系）

> [!proof] 证明
> 由归纳假设，$n = k$ 时命题成立。对于 $n = k+1$：
> $$P(k+1) = P(k) \\cdot f(k) = \\text{(展开后得证)}$$
> $\\square$

> [!cite] 引用来源
> "数学是科学的女王。" — 高斯

---

## 示例类（绿色系）

> [!example] 示例：计算 $e^x$ 的展开
> 令 $f(x) = e^x$，在 $x_0 = 0$ 处：
> - $f(0) = 1$
> - $f'(0) = 1$
> - $f''(0) = 1$
> 
> 因此 $e^x = 1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots$

> [!tip] 技巧
> 使用快捷键 **Ctrl+Shift+C** 可快速插入 Callout。

> [!success] 完成
> 所有测试用例已通过验证。

---

## 警告类（橙色系）

> [!warning] 收敛性警示
> 级数仅在收敛半径 $|x| < R$ 内有效。超出范围可能导致**发散**或**错误结果**。

> [!question] 思考问题
> 当 $n \\to \\infty$ 时，误差项 $R_n(x)$ 如何变化？

> [!help] 需要帮助？
> 如果遇到问题，请查阅 [官方文档](#) 或联系支持。

---

## 危险类（红色系）

> [!danger] 危险操作
> 此操作将**永久删除**所有数据，且**无法恢复**。

> [!error] 错误
> 无法解析表达式：语法错误位于第 42 行。

> [!bug] 已知问题
> 在某些边界条件下，算法可能产生数值不稳定。
`;

// 侧边批注与变量高亮测试
const ACADEMIC_FEATURES_EXAMPLE = `# 第 1 章：电磁场理论 {#chapter-1}

## 1.1 基本方程 {#nav-basic-eq}
麦克斯韦方程组的一般形式：

$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}$$

$$\\nabla \\cdot \\mathbf{B} = 0$$

## 1.2 波动方程
由上述方程可推导出电磁波方程。
<span class="md-sidenote">注意：这里假设光速 $c$ 为常数。</span>

$$\\nabla^2 \\mathbf{E} - \\frac{1}{\\text{c}^2} \\frac{\\partial^2 \\mathbf{E}}{\\partial t^2} = 0$$

其中 <span class="math-highlight">$\\text{c}$</span> 是真空光速。

# 第 2 章：量子力学初步 {#chapter-2}

## 2.1 薛定谔方程 {#nav-schrodinger}
新章节开始，公式编号将重新开始计数（由于 H1 reset 逻辑）。

$$i\\hbar\\frac{\\partial}{\\partial t}\\Psi(\\mathbf{r},t) = \\hat{H}\\Psi(\\mathbf{r},t)$$

> [!theory] 定理：波函数归一化
> 全空间发现粒子的概率总和为 1。
> $$\\int_{-\\infty}^{\\infty} |\\Psi|^2 d\\tau = 1$$

> [!example] 算符示例
> 动量算符：$\\hat{p} = -i\\hbar\\nabla$

# 第 3 章：导航测试 {#nav-chapter}

## 3.1 跨章节引用
在该章节中，我们可以跳转回 [第 1 章：基本方程](#nav-basic-eq) 或者 [第 2 章：薛定谔方程](#nav-schrodinger)。

也可以跳转到完整章节：[电磁场理论](#chapter-1) | [量子力学初步](#chapter-2)

## 3.2 局部跳转 {#nav-local}
点击这里 [回到本章开头](#nav-chapter)。
`;

// 简单示例
const SIMPLE_EXAMPLE = `# 基础测试

这是一段普通文本。

## 行内公式

爱因斯坦质能方程：$E = mc^2$

欧拉公式：$e^{i\\pi} + 1 = 0$

## 块级公式

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

## 混合内容

考虑函数 $f(x) = x^2$，其导数为 $f'(x) = 2x$。

$$\\frac{d}{dx}\\left( x^n \\right) = nx^{n-1}$$
`;

// 编辑状态与渲染一致性测试
const EDITING_STATE_EXAMPLE = `# 编辑状态与渲染一致性测试

这个页面用于测试编辑器 (CodeMirror) 中的 LaTeX 预览行为与最终渲染器 (MarkdownRenderer) 是否一致。

## 1. 安全过滤测试 (Sanitization)

MarkdownRenderer 会过滤掉潜在的危险命令。CodeMirror 预览也应该表现出安全的行为。

- **HTML 注入尝试**:
  - 输入: \`$\\htmlData{bad}{script}$\`
  - 预期: 渲染器显示 \`[BLOCKED: \\htmlData]\` 或类似警告，而不是执行或透传。

- **危险样式**:
  - 输入: \`$\\htmlStyle{color: red}{text}$\`
  - 预期: 被拦截。

## 2. 源码视图交互 (Source View)

MarkdownRenderer 支持双击公式切换 "渲染/源码" 模式。

- **测试步骤**:
  1. 双击下方的公式。
  2. 验证是否切换到了代码块视图。
  3. 验证代码块是否包含语法高亮。
  4. 验证是否有 "返回" 和 "复制" 按钮。

$$
f(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,e^{2\\pi i \\xi x} \\,d\\xi
$$

## 3. 行内 vs 块级检测

编辑器通常根据 \`$$\` 分界符或者 context 来判断 display mode。渲染器则有更复杂的逻辑（如检测 \\begin 环境）。

- **行内环境块**:
  应该被渲染为块级样式，即使只有单 \$ 包裹（如果渲染器有智能升级逻辑）：
  
  $ \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} $

- **普通的行内公式**:
  应该保持行内：$a^2 + b^2 = c^2$

## 4. 文本中的美元符号干扰

只有成对的 $ 且满足特定规则才会被解析为 LaTeX。

- **价格文本**:
  I have $100 and you have $200. (不应渲染)
  
- **变量名**:
  The variable name is $state. (不应渲染)

- **转义**:
  \$a + b\$ (不应渲染)

## 5. 多行与空行容错

\`\`\`latex
$$
line 1

line 2
$$
\`\`\`

$$
\\alpha + \\beta

\\gamma + \\delta
$$

## 6. 不完整/错误公式

- **未闭合**:
  $ x + y
  
- **语法错误**:
  $\\frac{1}{2$ (KaTeX error color should be visible)
`;

const WIKI_FEATURES_EXAMPLE = `# Wiki 功能测试 (WikiLinks & Embeds)

## 1. 点击链接测试 (WikiLinks)

- **基础链接**：[[Math_Core]]
- **带别名的链接**：[[Math_Core|数学核心概念]]
- **链接到章节**：[[Math_Core#Calculus]]
- **链接到嵌套章节**：[[Math_Core#Calculus#Derivatives]]
- **同页锚点链接**：[[#1. 点击链接测试 (WikiLinks)]] (跳转至本章开头)

## 2. 内容嵌入测试 (WikiEmbeds / Transclusion)

### 笔记嵌入 (Note Transclusion)
嵌入完整的笔记：
![[Math_Core]]

---

### 精准章节嵌入 (Section Transclusion)
仅嵌入 "Calculus" 章节及其子章节：
![[Math_Core#Calculus]]

仅嵌入 "Derivatives" 章节（包含其中的 LaTeX）：
![[Math_Core#Calculus#Derivatives]]

---

### 图片嵌入 (Image Embed)
![[Laser_Diagram.png|实验装置示意图]]

## 3. 递归与嵌套测试
嵌入一个包含自己图片的笔记：
![[Physics_Lab]]

## 4. 语法与状态测试
- **Hover 预览**：鼠标悬停在上面的链接上查看即时预览。
- **严格片段检查**：[[Math_Core##Calculus]] (双井号，应解析失败，显示为源码)
- **严格尾部检查**：[[Math_Core#]] (空片段，应解析失败)
- **不存在的笔记**：![[Missing_Note]] (应显示加载失败 UI)
`;

const EXAMPLES = [
    { key: 'wiki', name: 'Wiki 功能', content: WIKI_FEATURES_EXAMPLE },
    { key: 'fourier', name: '傅里叶级数', content: FOURIER_EXAMPLE },
    { key: 'editing', name: '编辑状态测试', content: EDITING_STATE_EXAMPLE },
    { key: 'code', name: '代码块交互', content: CODE_BLOCK_EXAMPLE },
    { key: 'callout', name: '语义提示框', content: CALLOUT_EXAMPLE },
    { key: 'academic', name: '学术排版', content: ACADEMIC_FEATURES_EXAMPLE },
    { key: 'table', name: '表格测试', content: TABLE_EXAMPLE },
    { key: 'edge', name: '边缘情况', content: EDGE_CASES_EXAMPLE },
    { key: 'basic', name: '基础测试', content: SIMPLE_EXAMPLE },
];

const EXAMPLE_MAP = Object.fromEntries(EXAMPLES.map(ex => [ex.key, ex.content]));

export const LatexTestPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const outputRef = useRef<HTMLDivElement>(null);

    // Mock data for WikiLink/Embed testing
    const mockNotes: Record<string, string> = {
        'Math_Core': `
# Mathematics Core
This is the central knowledge base for mathematics.

## Calculus
Calculus is the mathematical study of continuous change.

### Derivatives
The derivative of a function measures the sensitivity to change.

Example: $$\\frac{d}{dx}x^2 = 2x$$

### Integrals
An integral assigns numbers to functions describing area/volume.

## Geometry
Geometry is concerned with properties of space.
`,
        'Physics_Lab': `
# Physics Lab Notes
Experimental data and findings.

- Laser Emitter
- Photosensor

![[Laser_Diagram.png|Laser Setup Diagram]]
`
    };

    const resolveAsset = useCallback((name: string) => {
        return `https://picsum.photos/seed/${name}/800/400`;
    }, []);

    const resolveNote = useCallback(async (name: string) => {
        // Mock delay to test loading states
        await new Promise(r => setTimeout(r, 800));
        if (name === 'Missing_Note') throw new Error('Note not found in system');

        const content = mockNotes[name] || `# ${name}\nContent for ${name}...`;

        // 🚀 CRITICAL: Use the actual Rust parser to convert Markdown to HTML
        // This ensures math tags, headings, and lists are formatted exactly like the real app.
        try {
            const result = parse_content(content);
            return result.html;
        } catch (e) {
            console.error('Parser failed in mock:', e);
            return `<div>Error parsing note content</div>`;
        }
    }, []);

    const handleWikiLinkClick = useCallback((target: string) => {
        console.log('WikiLink Navigation:', target);
        // Simulate navigation by updating search params
        // This makes it feel like a real app routing
        const [page, fragment] = target.split('#');
        const params: Record<string, string> = { tab: 'wiki' };
        if (page) params.note = page;
        setSearchParams(params);

        // If there's a fragment, we'll handle it via hash update after a short delay
        if (fragment) {
            window.location.hash = fragment;
        }
    }, [setSearchParams]);

    // Get current tab from URL, default to 'wiki'
    const currentTab = searchParams.get('tab') || 'wiki';
    const currentContent = EXAMPLE_MAP[currentTab] || WIKI_FEATURES_EXAMPLE;

    const [input, setInput] = useState(currentContent);
    const debouncedInput = useDebounce(input, 150);

    // Handle initial note simulation from URL
    useEffect(() => {
        const note = searchParams.get('note');
        if (note && currentTab === 'wiki') {
            // ✅ Simulation: If it's a mock note, we update the editor content
            // In a real app, this would be a full page transition or side-panel open
            if (mockNotes[note]) {
                const simulatedContent = `# ${note}\n\nThis is a simulated view of the note **${note}**.\n\n${mockNotes[note]}`;
                setInput(simulatedContent);
            }
            console.log(`[Simulator] Active Note Context: ${note}`);
        }
    }, [searchParams, currentTab]);

    // Sync input with URL tab changes
    useEffect(() => {
        const newContent = EXAMPLE_MAP[currentTab];
        if (newContent && newContent !== input && !searchParams.get('note')) {
            setInput(newContent);
        }
    }, [currentTab, searchParams]);

    // Handle initial hash navigation on page load
    useEffect(() => {
        const hash = location.hash;
        if (hash && hash.length > 1) {
            // Wait for content to render, then scroll to anchor
            const scrollToAnchor = () => {
                const id = hash.slice(1);
                const container = outputRef.current;
                if (!container) return false;

                const target = container.querySelector(`[id = "${CSS.escape(id)}"]`);
                if (target) {
                    // Find scrollable parent
                    let scrollParent: HTMLElement | null = target.parentElement;
                    while (scrollParent && scrollParent !== container) {
                        const style = window.getComputedStyle(scrollParent);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                            break;
                        }
                        scrollParent = scrollParent.parentElement;
                    }

                    const scrollContainer = scrollParent || container;
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const offset = targetRect.top - containerRect.top + scrollContainer.scrollTop - 80;

                    scrollContainer.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
                    return true;
                }
                return false;
            };

            // Try immediately, then retry after render
            if (!scrollToAnchor()) {
                const timer = setTimeout(scrollToAnchor, 500);
                return () => clearTimeout(timer);
            }
        }
    }, [location.hash, debouncedInput]);

    // Handle tab change with URL update
    const handleTabChange = useCallback((key: string) => {
        setSearchParams({ tab: key });
    }, [setSearchParams]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300/50">
                <div>
                    <h1 className="text-2xl font-black">Markdown + LaTeX 渲染器测试</h1>
                    <p className="text-sm opacity-60 mt-1">沉浸式阅读模式 · 双击公式切换源码/渲染</p>
                </div>
                <div className="flex gap-2">
                    {EXAMPLES.map(ex => (
                        <button
                            key={ex.key}
                            className={`btn btn-sm ${currentTab === ex.key ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => handleTabChange(ex.key)}
                        >
                            {ex.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
                {/* Input */}
                <div className="flex flex-col overflow-hidden">
                    <h2 className="text-sm font-bold opacity-60 mb-2 px-1">输入 (Markdown + LaTeX)</h2>
                    <div className="flex-1 bg-base-200/50 rounded-xl overflow-hidden border border-base-300/30">
                        <QuickJotEditor
                            className="h-full font-mono text-sm"
                            value={input}
                            onChange={setInput}
                            theme="yellow" // Default theme, or add selector if needed
                            placeholder="在此输入 Markdown 或 LaTeX..."
                        />
                    </div>
                </div>

                {/* Output */}
                <div className="flex flex-col overflow-hidden" ref={outputRef}>
                    <h2 className="text-sm font-bold opacity-60 mb-2 px-1">渲染输出</h2>
                    <div className="flex-1 overflow-y-auto p-6 glass-surface rounded-xl">
                        <MarkdownRenderer
                            content={debouncedInput}
                            resolveAsset={resolveAsset}
                            resolveNote={resolveNote}
                            onWikiLinkClick={handleWikiLinkClick}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
