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
    // Match <code ...class="...language-math..."> or <span ...class="...math-inline|math-block...">
    // Handles single/double/no quotes and various attribute orders
    Regex::new(r#"(?i)<(?:code|span)\b[^>]*\bclass\s*=\s*['"]?[^'"]*\b(?:language-math|math-inline|math-block|math-display)\b"#).unwrap()
});
static CODE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<pre\b[^>]*>\s*<code\b"#).unwrap()
});
static TABLE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<table\b[^>]*>"#).unwrap()
});

#[derive(Serialize)]
pub struct ParseResult {
    pub html: String,
    pub hash: String,
    pub has_math: bool,
    pub has_code: bool,
    pub has_table: bool,
    pub has_wiki_links: bool,
    pub has_wiki_embeds: bool,
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

/// Escape for HTML *text node* context (inner text).
/// Note: text nodes do not need to escape quotes, being slightly faster than attr escaping.
#[inline]
fn escape_html_text(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            _ => result.push(c),
        }
    }
    result
}

/// Parse a light HTML tag starting at `i` (where bytes[i] == b'<').
/// Returns (tag_end_index_exclusive, char_discriminator, is_closing, is_self_closing)
#[inline]
fn parse_tag(bytes: &[u8], i: usize) -> (usize, Option<u8>, bool, bool) {
    let len = bytes.len();
    let mut j = i + 1;
    let mut quote: Option<u8> = None;

    while j < len {
        let b = bytes[j];
        if let Some(q) = quote {
            if b == q { quote = None; }
        } else if b == b'"' || b == b'\'' {
            quote = Some(b);
        } else if b == b'>' {
            break;
        }
        j += 1;
    }
    let end = if j < len { j + 1 } else { len };

    let mut k = i + 1;
    while k < end && bytes[k].is_ascii_whitespace() { k += 1; }

    let mut is_closing = false;
    if k < end && bytes[k] == b'/' {
        is_closing = true;
        k += 1;
        while k < end && bytes[k].is_ascii_whitespace() { k += 1; }
    }

    let name_start = k;
    while k < end && bytes[k].is_ascii_alphanumeric() { k += 1; }
    let name = &bytes[name_start..k];

    let kind = if name.eq_ignore_ascii_case(b"code") { Some(b'c') }
               else if name.eq_ignore_ascii_case(b"pre") { Some(b'p') }
               else if name.eq_ignore_ascii_case(b"a") { Some(b'a') }
               else { None };

    let mut is_self_closing = false;
    if end >= 2 && bytes[end - 1] == b'>' {
        let mut t = end - 2;
        while t > i && bytes[t].is_ascii_whitespace() { t -= 1; }
        if bytes[t] == b'/' { is_self_closing = true; }
    }

    (end, kind, is_closing, is_self_closing)
}

#[derive(Debug)]
struct WikiLinkParts<'a> {
    full_target: String,    // 规范化后的全路径: "Page#H1#H2"
    page: &'a str,          // 页面名
    fragment: String,       // 片段路径: "H1#H2"
    label: &'a str,         // 显式别名 (可能为空)
    has_explicit_label: bool,
}

/// ✅ P1: ASCII Optimized image detection without allocation
fn is_image_ext(page: &str) -> bool {
    let ext = match page.rsplit('.').next() {
        Some(e) if e.len() != page.len() => e, // 确保真的有 '.' 且不是以 '.' 开头
        _ => return false,
    };
    ext.eq_ignore_ascii_case("png")
        || ext.eq_ignore_ascii_case("jpg")
        || ext.eq_ignore_ascii_case("jpeg")
        || ext.eq_ignore_ascii_case("webp")
        || ext.eq_ignore_ascii_case("gif")
        || ext.eq_ignore_ascii_case("svg")
}

/// 解析位于 `i` 处的 WikiLink（[[...]] 或 ![[...]] 内部内容）
fn parse_wikilink_at<'a>(html: &'a str, bytes: &[u8], i: usize) -> Option<(usize, WikiLinkParts<'a>)> {
    let len = bytes.len();
    if i + 1 >= len || bytes[i] != b'[' || bytes[i + 1] != b'[' { return None; }

    let start = i + 2;
    let mut j = start;
    let mut pipe_pos: Option<usize> = None;

    while j + 1 < len {
        let b = bytes[j];
        if b == b'\n' || b == b'\r' || b == b'[' { return None; } // 不允许跨行或嵌套
        if b == b']' {
            if bytes[j + 1] == b']' { break; }
            return None; // 单个 ] 不合法
        }
        if b == b'|' && pipe_pos.is_none() { pipe_pos = Some(j); }
        j += 1;
    }

    if j + 1 >= len || bytes[j] != b']' || bytes[j + 1] != b']' { return None; }

    let (dest_raw, label_raw_opt) = if let Some(p) = pipe_pos {
        (&html[start..p], Some(&html[p + 1..j]))
    } else {
        (&html[start..j], None)
    };

    let dest = dest_raw.trim();
    if dest.is_empty() { return None; }

    let (label, has_explicit_label) = match label_raw_opt {
        Some(l) => (l.trim(), true),
        None => ("", false),
    };

    // 解析目的地: Page#H1#H2
    let mut page = "";
    let mut fragments: Vec<&str> = Vec::new();

    // ✅ P0: Strict fragment checking - no empty segments allowed
    if let Some(rest) = dest.strip_prefix('#') {
        let rest = rest.trim();
        if rest.is_empty() { return None; }
        for seg in rest.split('#') {
            let s = seg.trim();
            if s.is_empty() { return None; }
            fragments.push(s);
        }
    } else {
        let mut it = dest.split('#');
        page = it.next().unwrap_or("").trim();
        if page.is_empty() { return None; }
        for seg in it {
            let s = seg.trim();
            if s.is_empty() { return None; }
            fragments.push(s);
        }
    }

    if page.is_empty() && fragments.is_empty() { return None; }

    let fragment = fragments.join("#");
    let mut full_target = String::with_capacity(page.len() + fragment.len() + 1);
    if page.is_empty() {
        full_target.push('#');
        full_target.push_str(&fragment);
    } else {
        full_target.push_str(page);
        if !fragment.is_empty() {
            full_target.push('#');
            full_target.push_str(&fragment);
        }
    }

    Some((j + 2, WikiLinkParts {
        full_target,
        page,
        fragment,
        label,
        has_explicit_label,
    }))
}

/// 渲染默认显示文本: "Page > H1 > H2"
fn push_default_display(out: &mut String, page: &str, fragment: &str) {
    if fragment.is_empty() {
        out.push_str(&escape_html_text(page));
        return;
    }
    if page.is_empty() {
        for (idx, seg) in fragment.split('#').enumerate() {
            if idx > 0 { out.push_str(" &gt; "); }
            out.push_str(&escape_html_text(seg));
        }
        return;
    }
    out.push_str(&escape_html_text(page));
    for seg in fragment.split('#') {
        out.push_str(" &gt; ");
        out.push_str(&escape_html_text(seg));
    }
}

/// ✅ P0 优化: 结构解耦的高性能 WikiLink/Embed 处理器
fn process_wiki_links(html: &str) -> (String, bool, bool) {
    if !html.contains("[[") {
        return (html.to_string(), false, false);
    }

    let bytes = html.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len + 1024);
    let mut has_wiki_links = false;
    let mut has_wiki_embeds = false;
    let mut last = 0;
    let mut skip_depth: i32 = 0;
    let mut i = 0;

    while i < len {
        match bytes[i] {
            b'<' => {
                if last < i { out.push_str(&html[last..i]); }
                let (tag_end, kind, is_closing, is_self_closing) = parse_tag(bytes, i);
                if let Some(_) = kind {
                    if !is_self_closing {
                        if is_closing { skip_depth = skip_depth.saturating_sub(1); }
                        else { skip_depth = skip_depth.saturating_add(1); }
                    }
                }
                out.push_str(&html[i..tag_end]);
                i = tag_end;
                last = i;
            }
            b'[' => {
                if i + 1 < len && bytes[i + 1] == b'[' && skip_depth == 0 {
                    let is_embed = i > 0 && bytes[i - 1] == b'!';
                    let start_idx = if is_embed { i - 1 } else { i };

                    if let Some((end, parts)) = parse_wikilink_at(html, bytes, i) {
                        if last < start_idx { out.push_str(&html[last..start_idx]); }

                        let is_image = is_image_ext(parts.page);
                        
                        let escaped_full = escape_html_attr(&parts.full_target);
                        let escaped_page = escape_html_attr(parts.page);
                        let escaped_frag = escape_html_attr(&parts.fragment);

                        if is_embed {
                            has_wiki_embeds = true;
                            let embed_type = if is_image { "image" } else { "note" };
                            let escaped_alias = escape_html_attr(parts.label);
                            out.push_str("<span class=\"wiki-embed\" data-embed=\"true\" data-type=\"");
                            out.push_str(embed_type);
                            out.push_str("\" data-target=\"");
                            out.push_str(&escaped_full);
                            out.push_str("\" data-page=\"");
                            out.push_str(&escaped_page);
                            out.push_str("\" data-fragment=\"");
                            out.push_str(&escaped_frag);
                            if parts.has_explicit_label {
                                let escaped_alias = escape_html_attr(parts.label);
                                out.push_str("\" data-alias=\"");
                                out.push_str(&escaped_alias);
                            }
                            out.push_str("\">");
                            
                            if is_image { out.push_str("<span class=\"wiki-embed-image-placeholder\">🖼️ "); }
                            else { out.push_str("<span class=\"wiki-embed-note-placeholder\">📄 "); }
                            
                            if parts.has_explicit_label && !parts.label.is_empty() {
                                out.push_str(&escape_html_text(parts.label));
                            } else {
                                push_default_display(&mut out, parts.page, &parts.fragment);
                            }
                            out.push_str("</span></span>");
                        } else {
                            has_wiki_links = true;
                            out.push_str("<a class=\"wiki-link\" data-target=\"");
                            out.push_str(&escaped_full);
                            out.push_str("\" data-page=\"");
                            out.push_str(&escaped_page);
                            out.push_str("\" data-fragment=\"");
                            out.push_str(&escaped_frag);
                            out.push_str("\" href=\"#\" title=\"Link to: ");
                            out.push_str(&escaped_full);
                            out.push_str("\">");

                            if parts.has_explicit_label && !parts.label.is_empty() {
                                out.push_str(&escape_html_text(parts.label));
                            } else {
                                push_default_display(&mut out, parts.page, &parts.fragment);
                            }
                            out.push_str("</a>");
                        }

                        i = end;
                        last = i;
                        continue;
                    }
                }
                i += 1;
            }
            _ => { i += 1; }
        }
    }

    if last < len { out.push_str(&html[last..len]); }
    (out, has_wiki_links, has_wiki_embeds)
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
                frontmatter: true,
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
    // 这比 regex replace_all 更高效，特别是对于大型文档 (large documents)
    let (html, has_wiki_links, has_wiki_embeds) = process_wiki_links(&html);

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
        has_wiki_embeds,
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
