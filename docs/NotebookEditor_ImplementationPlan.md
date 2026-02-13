# SmartArchive Notebook Editor — Implementation Plan (Final)

## Database Schema

Based on existing tables in the `public` schema of project `osocsrklgxzvdtkokxao`:

### `notes` Table
Primary storage for both Question Jots and Global Notes.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `uuid` | `gen_random_uuid()` | Primary Key |
| `user_id` | `uuid` | - | Owner of the note (FK to auth.users) |
| `type` | `note_type` | `'GLOBAL'` | Enum: `QUESTION`, `GLOBAL` |
| `is_folder` | `boolean` | `false` | Whether this entry represents a folder |
| `parent_id` | `uuid` | - | For building the file tree (self-reference) |
| `question_id` | `uuid` | - | Linked question for `QUESTION` type jots |
| `title` | `text` | - | Note or folder title |
| `content` | `jsonb` | - | Note content (Markdown structure) |
| `plain_text` | `text` | - | Extracted plain text for search indexing |
| `created_at` | `timestamptz` | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | `now()` | Last update timestamp |

### `note_references` Table
Stores graph connections (Wiki Links) between notes and questions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `uuid` | `gen_random_uuid()` | Primary Key |
| `source_note_id` | `uuid` | - | The note containing the link |
| `ref_node_id` | `uuid` | - | Deterministic ID (uuid.v5) for sync stability |
| `target_question_id`| `uuid` | - | Target question if type is `q:` |
| `target_note_id` | `uuid` | - | Target note if type is `n:` |
| `target_part` | `ref_target_part` | - | Which part of the target is referenced |
| `target_anchor` | `text` | - | Specific section/anchor within the target |
| `mode` | `ref_mode` | `'LIVE'` | Enum: `SNAPSHOT`, `LIVE` |
| `created_at` | `timestamptz` | `now()` | Link creation timestamp |

---

## Architecture Overview

```
NotebookPage (/notebook)
├── NotesSidebar (left panel)
│   ├── Search bar
│   ├── View toggle: Folders / Recents
│   ├── File tree (lazy-loaded by folder)
│   └── Create note / folder actions
├── NoteEditor (center)
│   ├── Title bar (inline editable)
│   ├── NoteEditorCore (CodeMirror 6, always-editable)
│   │   Extensions: smartList, bracketPairing, latexPreview,
│   │               wikiLink (Ctrl+Click nav), wikiLinkCompletion,
│   │               autoSave (2-tier: IDB L1 + Server L2)
│   └── Status bar (save state, word count, shortcuts)
└── Preview panel (right, optional toggle)
    ├── MarkdownRenderer (live)
    └── Backlinks section
```

## Two Note Types

| Aspect | Question Jot (existing) | Global Note (new) |
|--------|------------------------|-------------------|
| DB type | QUESTION | GLOBAL |
| Edit mode | Double-click to enter | Always editable |
| Save | Manual (Esc/blur) | Auto (2-tier: IDB 500ms + Server 2s) |
| Title | Auto-generated | User-editable |
| Folders | None | Tree hierarchy via parent_id |
| References | Passive (gets referenced) | Active (creates [[links]]) |
| Entry point | ReviewSession sidebar | /notebook page |

## Wiki Link Format & Resolution

### Insert format: `[[Display Title|target_id]]`
- When user selects from autocomplete: `[[傅里叶展开题|q:abc123]]`
  - `q:` prefix = question, `n:` prefix = note
- When user types manually without autocomplete: `[[手动文本]]`
  - On save, fuzzy-match to resolve → if found, rewrite to `[[title|id]]`
  - If unresolved, keep as-is, mark in UI

### ref_node_id generation (deterministic):
```typescript
import { v5 as uuidv5 } from 'uuid';
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function makeRefNodeId(sourceNoteId: string, targetType: 'q'|'n', targetId: string): string {
  return uuidv5(`${sourceNoteId}:${targetType}:${targetId}`, NAMESPACE);
}
```

### On save: extract refs from markdown
```typescript
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
// match[1] = display text, match[2] = id (if present)
```

## Two-Tier Autosave Strategy

```
User types → onChange
  ├─ L1: IDB draft write (500ms debounce)
  │   └─ Survives page crash, offline
  └─ L2: Server PATCH (2s idle OR blur/switch-note)
      ├─ Extract refs from markdown
      ├─ PATCH /notes/:id { content, plainText, refs, title }
      ├─ Success → update lastSavedAt, clear dirty
      └─ Failure → show error badge, retry in 60s
```

## Phase 1 Tasks (P0 — Core MVP)

### 1.1 Server: Add /notes/search endpoint
- `GET /notes/search?q=xxx&limit=10`
- Searches both `notes` (GLOBAL) and `error_questions` by title
- Returns `{ results: [{id, title, type: 'note'|'question', snippet}] }`
- Used by wikiLinkCompletion

### 1.2 Route + Navigation
- Add `/notebook` route to AppRoutes.tsx
- Add `BookOpen` nav item to Sidebar.tsx NAV_ITEMS
- Lazy load NotebookPage

### 1.3 NotebookPage layout
- Three-panel layout: sidebar(280px) | editor(flex) | preview(optional, 340px)
- URL params: `?noteId=xxx` for direct link, `?folderId=xxx` for folder

### 1.4 NotesSidebar
- Search input (debounced 300ms)
- Two views: Folders tree / Recents list
- Tree: root-level items → click folder to expand (lazy load children)
- Actions: New Note, New Folder, Rename (inline), Delete (confirm)
- Selected note highlight, keyboard nav (↑↓ Enter)

### 1.5 NoteEditorCore
- CodeMirror 6, always editable (no edit/view mode toggle)
- Shared extensions from QuickJotEditor: smartList, bracketPairing, latexPreview
- Enhanced wikiLink: Ctrl+Click navigation, hover underline
- Enhanced wikiLinkCompletion: search notes + questions via /notes/search
- New autoSave extension: 2-tier (IDB + server)
- Inline title editing above editor

### 1.6 useNoteEditor hook
- State: noteId, title, draft, isDirty, isSaving, lastSavedAt, error
- Actions: loadNote, saveDraft(IDB), flushToServer, switchNote(save-then-load)
- refs extraction on save

### 1.7 queries/notes.ts enhancements
- useGlobalNotes(parentId) — folder contents
- useRecentNotes() — recent global notes
- useDeleteNote() — mutation
- useRenameNote() — mutation
- useSearchNotes(query) — for wiki link completion
- useMoveNote() — move to folder

### 1.8 BacklinksList enhancement
- Add onClick handler → navigate('/notebook?noteId=xxx')
- For question jots: navigate to question detail? or keep as-is

## Phase 2 Tasks (P1 — Polish)

- Split preview panel with MarkdownRenderer
- Editor toolbar (bold/italic/heading/list/code/latex buttons)
- Drag-and-drop folder reordering
- Empty state / onboarding for first-time users
- Full i18n coverage
- Keyboard shortcuts (Ctrl+S force save, Ctrl+N new note)

## Phase 3 Tasks (P2 — Advanced)

- Image drag/paste upload to Supabase Storage
- Batch rename link content update
- `/notes/:id/context` aggregated endpoint
- Graph view of note connections
- Offline sync with conflict resolution
- Note templates
