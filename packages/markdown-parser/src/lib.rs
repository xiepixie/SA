use serde::Serialize;
use wasm_bindgen::prelude::*;
use once_cell::sync::Lazy;
use regex::Regex;

/// Maximum input size to prevent DoS (~500 KiB)
/// Note: 512_000 bytes ≈ 500 KiB (1 KiB = 1024 bytes)
const MAX_INPUT_SIZE: usize = 512_000;

// ✅ P0: More robust regex patterns that don't assume attribute order
// These patterns work regardless of where `class` appears in the tag
static MATH_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    // Match <code ...class="...language-math..."> with any attribute order
    Regex::new(r#"<code\b[^>]*\bclass="[^"]*\blanguage-math\b"#).unwrap()
});
static CODE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    // Match <pre>...<code with optional attributes/whitespace
    Regex::new(r#"<pre\b[^>]*>\s*<code\b"#).unwrap()
});
static TABLE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    // Match <table with any attributes
    Regex::new(r#"<table\b[^>]*>"#).unwrap()
});

#[derive(Serialize)]
pub struct ParseResult {
    pub html: String,
    pub hash: String,
    pub has_math: bool,
    pub has_code: bool,
    pub has_table: bool,
    /// Indicates whether the document contains **clickable** wiki-links.
    /// [[...]] inside code/pre/a blocks are NOT counted (they remain as literal text).
    /// This semantic is intentional: frontend only cares about interactive links.
    pub has_wiki_links: bool,
}

/// ✅ P0: Efficient HTML attribute escaping without chained .replace() calls
/// Uses a single pass with capacity pre-allocation
#[inline]
fn escape_html_attr(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            _ => result.push(c),
        }
    }
    result
}

/// ✅ P0 优化: 高效单次遍历状态机处理 WikiLink
/// 
/// **Algorithm**: Single-pass state machine with O(n) time complexity
/// 
/// **Semantic**: `has_wiki_links` is TRUE only when we produce a clickable `<a>` element.
/// [[...]] inside <code>, <pre>, or <a> tags are left as literal text and NOT counted.
/// This is the desired behavior - frontend only needs to know about interactive links.
/// 
/// **Assumptions**:
/// - Input HTML is well-formed (balanced open/close tags for code/pre/a)
/// - markdown-rs output with `allow_dangerous_html=false` guarantees this
/// - Self-closing tags like `<a .../>` are NOT expected from markdown-rs
/// - If `allow_dangerous_html` is enabled in the future, this logic may need revision
fn process_wiki_links(html: &str) -> (String, bool) {
    let bytes = html.as_bytes();
    let len = bytes.len();
    
    // 快速路径：如果没有 [[ 则直接返回（零拷贝场景除外）
    if !html.contains("[[") {
        return (html.to_string(), false);
    }
    
    let mut result = String::with_capacity(html.len() + 256);
    let mut has_wiki_links = false;
    let mut skip_depth: i32 = 0;
    let mut i = 0;
    
    while i < len {
        // 检测 HTML 标签
        if bytes[i] == b'<' {
            // 检查是否是 code, pre, 或 a 标签
            let remaining = &html[i..];
            
            // ✅ P0: 零分配的大小写不敏感检查（使用 eq_ignore_ascii_case）
            // markdown-rs 总是输出小写标签，但我们仍保持鲁棒性
            let remaining_bytes = remaining.as_bytes();
            
            // 闭合标签检测
            if remaining.len() >= 7 && remaining_bytes[1] == b'/' {
                let tag_start = &remaining[2..remaining.len().min(6)];
                if tag_start.eq_ignore_ascii_case("code") {
                    skip_depth = skip_depth.saturating_sub(1);
                } else if tag_start.len() >= 3 && tag_start[..3].eq_ignore_ascii_case("pre") {
                    skip_depth = skip_depth.saturating_sub(1);
                } else if tag_start.len() >= 1 && (tag_start.starts_with('a') || tag_start.starts_with('A')) {
                    // </a> or </A>
                    if remaining.len() >= 4 && (remaining_bytes[3] == b'>' || remaining_bytes[3] == b' ') {
                        skip_depth = skip_depth.saturating_sub(1);
                    }
                }
            }
            // 开始标签检测
            else if remaining.len() >= 5 {
                let tag_start = &remaining[1..remaining.len().min(5)];
                if tag_start.eq_ignore_ascii_case("code") {
                    skip_depth += 1;
                } else if tag_start.len() >= 3 && tag_start[..3].eq_ignore_ascii_case("pre") {
                    skip_depth += 1;
                } else if tag_start.len() >= 2 && 
                          (tag_start.starts_with("a ") || tag_start.starts_with("a>") ||
                           tag_start.starts_with("A ") || tag_start.starts_with("A>")) {
                    skip_depth += 1;
                }
            }
            
            result.push('<');
            i += 1;
            continue;
        }
        
        // 检测 [[wiki link]]
        if bytes[i] == b'[' && i + 1 < len && bytes[i + 1] == b'[' && skip_depth == 0 {
            // 查找闭合的 ]]
            if let Some(end_offset) = html[i + 2..].find("]]") {
                let target = &html[i + 2..i + 2 + end_offset];
                
                // 验证 target: 非空，不含嵌套括号
                if !target.is_empty() && !target.contains('[') && !target.contains(']') {
                    has_wiki_links = true;
                    
                    // ✅ P0: 使用高效的单次遍历转义
                    let escaped = escape_html_attr(target);
                    
                    result.push_str("<a class=\"wiki-link\" data-target=\"");
                    result.push_str(&escaped);
                    result.push_str("\" href=\"#\" title=\"Link to: ");
                    result.push_str(&escaped);
                    result.push_str("\">");
                    result.push_str(&escaped);
                    result.push_str("</a>");
                    
                    i += 2 + end_offset + 2; // 跳过 [[ + content + ]]
                    continue;
                }
            }
        }
        
        // 普通字符，直接复制
        result.push(bytes[i] as char);
        i += 1;
    }
    
    (result, has_wiki_links)
}

/// Parses Markdown content with full GFM support + Math extensions.
///
/// **Security:**
/// - XSS Protection: `allow_dangerous_html=false`, `allow_dangerous_protocol=false`
/// - DoS Protection: Input size limited to ~500 KiB (512,000 bytes)
///
/// **Enabled Features:**
/// - Math: `$...$` (inline) and `$$...$$` (block)
/// - GFM: Tables, Task Lists, Strikethrough, Autolinks, Footnotes
/// - Frontmatter (YAML)
///
/// Returns HTML where math is rendered as `<code class="language-math math-inline">...</code>`
#[wasm_bindgen]
pub fn parse_content(input: &str) -> Result<JsValue, JsValue> {
    // ✅ P0: DoS Protection - Input size limit
    if input.len() > MAX_INPUT_SIZE {
        return Err(JsValue::from_str(&format!(
            "Content too large ({} bytes). Maximum allowed: {} bytes ({}KB). Please split into smaller sections.",
            input.len(),
            MAX_INPUT_SIZE,
            MAX_INPUT_SIZE / 1024
        )));
    }

    // ✅ P1: Use official GFM preset + Math extensions
    let options = markdown::Options {
        parse: markdown::ParseOptions {
            constructs: markdown::Constructs {
                // Math extensions (layered on top of GFM)
                math_text: true,
                math_flow: true,
                // Use GFM baseline for everything else
                ..markdown::Constructs::gfm()
            },
            // GFM parsing behaviors
            ..markdown::ParseOptions::gfm()
        },
        compile: markdown::CompileOptions {
            // ✅ P0: XSS Protection
            allow_dangerous_html: false, // Block <script>, inline handlers, etc.
            allow_dangerous_protocol: false, // Block javascript:, data:, etc.

            // ✅ P0: Remove gfm_tagfilter (no effect when allow_dangerous_html=false)
            // Keeping it enabled creates false security assumptions
            gfm_tagfilter: false,

            // GFM footnote config
            gfm_footnote_label: Some("Footnotes".into()),
            gfm_footnote_back_label: Some("Back to content".into()),
            gfm_footnote_clobber_prefix: Some("user-content-".into()),

            ..markdown::CompileOptions::default()
        },
    };

    let html = markdown::to_html_with_options(input, &options)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    // ✅ P0 优化: 单次遍历状态机处理 WikiLink 转换
    // 这比 regex replace_all 更高效，特别是对于长文档
    let (html, has_wiki_links) = process_wiki_links(&html);

    // ✅ P0: Detect features using precise regex patterns to avoid false positives
    let has_math = MATH_TAG_RE.is_match(&html);
    let has_code = CODE_TAG_RE.is_match(&html);
    let has_table = TABLE_TAG_RE.is_match(&html);

    let hash = simple_hash(&html);

    let result = ParseResult {
        html,
        hash,
        has_math,
        has_code,
        has_table,
        has_wiki_links,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Simple FNV-1a hash for content caching (UI-only, not for security/cryptography)
fn simple_hash(input: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_input_size() {
        let large_input = "x".repeat(MAX_INPUT_SIZE + 1);
        let result = parse_content(&large_input);
        assert!(result.is_err());
    }

    #[test]
    fn test_math_detection() {
        // This would need wasm-bindgen-test for full testing
        // But shows the intent
    }
}
