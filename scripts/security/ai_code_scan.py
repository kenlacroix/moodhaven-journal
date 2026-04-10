#!/usr/bin/env python3
"""
AI Codebase Scanner v2
----------------------
Modes:
  scan     — Folder-level code review (original behaviour)
             Optional: --since <commit> to only scan git-changed files
  context  — Build a Claude-ready context bundle from a plan file or task
             Required: --plan <file.md>  OR  --task "description"

Dependencies (required):
  pip install openai

Dependencies (optional, recommended):
  pip install pyyaml     # richer YAML frontmatter in plan files
  pip install tiktoken   # accurate token counting instead of char/4 estimate

Usage:
  python ai_code_scan.py
  python ai_code_scan.py --mode scan --since HEAD~5
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md
  python ai_code_scan.py --mode context --task "Add P2P sync to setup screen"
  python ai_code_scan.py --mode context --task "..." --model gpt-4o
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md --no-trace
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md --rebuild-index

Plan file format (YAML frontmatter optional):
  ---
  task: "Phase 5 — P2P sync on setup screen"
  goal: |
    Update the sync modal to include P2P sync controls.
    Add P2P sync step to the setup screen so users can skip setup.
  relevant_files:
    - src/components/sync/SyncDetailsModal.tsx
    - src/pages/SetupScreen.tsx
  relevant_dirs:
    - src/lib/
  keywords:
    - peerSync
    - peerPairing
    - SyncDetailsModal
  acceptance_criteria:
    - Sync modal shows nearby peers and a sync button
    - Setup screen has a P2P sync step with a "skip setup" option
  ---
  Any additional free-text notes here are included in the bundle.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from openai import OpenAI

# ── Optional dependencies ──────────────────────────────────────────────────────


try:
    import tiktoken
    _enc = tiktoken.encoding_for_model("gpt-4o-mini")
    def count_tokens(text: str) -> int:
        return len(_enc.encode(text))
    HAS_TIKTOKEN = True
except ImportError:
    def count_tokens(text: str) -> int:  # type: ignore[misc]
        return len(text) // 4
    HAS_TIKTOKEN = False

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

_client: Optional["OpenAI"] = None

def get_client() -> "OpenAI":
    global _client
    if _client is None:
        _client = OpenAI()
    return _client

# ── CONFIG ─────────────────────────────────────────────────────────────────────

OUTPUT_DIR  = Path("docs/aifeedback")
INDEX_FILE  = OUTPUT_DIR / ".codebase_index.json"
BUNDLES_DIR = OUTPUT_DIR / "context_bundles"

MODEL_CHEAP = "gpt-4o-mini"

# Pricing per 1M tokens: (input, output)
COSTS: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15,  0.60),
    "gpt-4o":      (2.50, 10.00),
}

SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".rs", ".sql", ".css", ".scss", ".html"}
SKIP_DIRS         = {"node_modules", ".git", "dist", "build", "target", "__pycache__", "coverage"}
SKIP_EXTENSIONS   = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf",
    ".sqlite", ".db", ".lock",
    ".exe", ".dll", ".so", ".dylib",
    ".zip", ".tar", ".gz", ".7z",
}

MAX_FILE_SIZE       = 1_000_000   # bytes
MAX_CHARS_PER_BATCH = 20_000      # scan mode batch size
MAX_CONTEXT_TOKENS  = 80_000      # cap for context bundle code section
INDEX_TTL_SECONDS   = 86_400      # 24 h before index is considered stale
THREAD_WORKERS      = 4

TS_IMPORT_RE = re.compile(r"""from\s+['"](\.\.?/[^'"#\s]+)['"]""", re.MULTILINE)


# ── 1. TOKEN / COST HELPERS ────────────────────────────────────────────────────

def estimate_cost(model: str, input_tokens: int, output_tokens: int = 1000) -> float:
    inp_rate, out_rate = COSTS.get(model, (0.0, 0.0))
    return (input_tokens * inp_rate + output_tokens * out_rate) / 1_000_000

def fmt_cost(cost: float) -> str:
    return f"${cost:.4f}" if cost < 0.01 else f"${cost:.3f}"


# ── FILE HELPERS ───────────────────────────────────────────────────────────────

def is_source_file(path: Path) -> bool:
    if path.suffix not in SOURCE_EXTENSIONS:
        return False
    if path.suffix in SKIP_EXTENSIONS:
        return False
    try:
        if path.stat().st_size > MAX_FILE_SIZE:
            return False
    except OSError:
        return False
    return True

def trim_code(path: Path, head: int = 500, tail: int = 200) -> str:
    """Return file content trimmed to head+tail lines to save tokens."""
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    except Exception:
        return ""
    if len(lines) <= head + tail:
        return "".join(lines)
    return "".join(lines[:head]) + "\n\n// ... trimmed ...\n\n" + "".join(lines[-tail:])

def hash_file(path: Path, lines: int = 20) -> Optional[str]:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        head = "".join(content.splitlines()[:lines])
        return hashlib.md5(head.encode()).hexdigest()
    except Exception:
        return None


# ── 3. IMPORT TRACING ─────────────────────────────────────────────────────────

def _resolve_ts_path(candidate: Path) -> Optional[Path]:
    """Try adding TS/JS extensions or /index.ts(x) to locate the actual file."""
    if candidate.exists() and candidate.is_file():
        return candidate
    for ext in (".ts", ".tsx", ".js", ".jsx"):
        p = candidate.with_suffix(ext)
        if p.exists():
            return p
    for ext in (".ts", ".tsx"):
        p = candidate / f"index{ext}"
        if p.exists():
            return p
    return None

def trace_imports(seed_files: list[Path], depth: int = 2) -> list[Path]:
    """
    BFS over local TS/TSX/JS imports up to `depth` levels.
    Returns dependency files discovered beyond the seeds.
    """
    visited: set[Path] = set(seed_files)
    frontier: list[Path] = list(seed_files)

    for _ in range(depth):
        next_frontier: list[Path] = []
        for fp in frontier:
            if fp.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
                continue
            try:
                content = fp.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for match in TS_IMPORT_RE.finditer(content):
                rel       = match.group(1)
                candidate = (fp.parent / rel).resolve()
                resolved  = _resolve_ts_path(candidate)
                if resolved and resolved not in visited:
                    visited.add(resolved)
                    next_frontier.append(resolved)
        frontier = next_frontier

    return [p for p in visited if p not in set(seed_files)]


# ── 5. GIT-DIFF HELPERS ────────────────────────────────────────────────────────

def get_changed_files(since: str) -> set[Path]:
    """Return absolute Paths of files changed since a git ref."""
    try:
        root_str = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        out = subprocess.check_output(
            ["git", "diff", "--name-only", since],
            text=True, stderr=subprocess.DEVNULL,
        )
        repo_root = Path(root_str)
        return {(repo_root / p).resolve() for p in out.strip().splitlines() if p}
    except subprocess.CalledProcessError:
        print(f"Warning: git diff --name-only {since!r} failed")
        return set()


# ── 7. CODEBASE INDEX CACHE ────────────────────────────────────────────────────

_EXPORT_RE = re.compile(
    r"export\s+(?:default\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)"
)
_IMPORT_PATH_RE = re.compile(r"""from\s+['"](\.\.?/[^'"#\s]+)['"]""")

def build_index(root: Path) -> dict:
    """
    Walk the repo and produce a lightweight index:
      { "relative/path.ts": { "exports": [...], "imports": [...], "size": N } }
    Used for fast keyword-to-file resolution without re-reading every file.
    """
    index: dict[str, dict] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not is_source_file(path):
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            index[str(path.relative_to(root))] = {
                "exports": _EXPORT_RE.findall(content),
                "imports": _IMPORT_PATH_RE.findall(content),
                "size":    path.stat().st_size,
            }
        except Exception:
            pass
    return index

def load_or_build_index(root: Path, force: bool = False) -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not force and INDEX_FILE.exists():
        age = time.time() - INDEX_FILE.stat().st_mtime
        if age < INDEX_TTL_SECONDS:
            try:
                return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
    print("Building codebase index...")
    index = build_index(root)
    INDEX_FILE.write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"  Indexed {len(index)} files → {INDEX_FILE}")
    return index

def search_index(index: dict, keywords: list[str], root: Path) -> list[Path]:
    """Return files whose path, exports, or local import paths mention any keyword."""
    kws = [k.lower() for k in keywords]
    results: list[Path] = []
    for rel, meta in index.items():
        haystack = (
            rel.lower()
            + " " + " ".join(meta.get("exports", [])).lower()
            + " " + " ".join(meta.get("imports", [])).lower()
        )
        if any(kw in haystack for kw in kws):
            p = (root / rel).resolve()
            if p.exists():
                results.append(p)
    return results


# ── OPENAI CALLS ───────────────────────────────────────────────────────────────

def openai_call(
    system: str,
    user: str,
    model: str = MODEL_CHEAP,
    max_tokens: int = 1500,
) -> str:
    try:
        r = get_client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            max_tokens=max_tokens,
        )
        return r.choices[0].message.content or ""
    except Exception as e:
        return f"[OpenAI error: {e}]"

def select_files_from_plan(
    plan_body: str, index: dict, root: Path, task_type: str = "feature"
) -> list[Path]:
    """
    Send the plan description + a compact codebase index to GPT and ask it to
    directly select the relevant files. Semantically smarter than keyword matching
    and requires no frontmatter from the user.

    task_type: 'feature' or 'bugfix' — controls the selection rules sent to GPT.
    """
    # Build compact index: "relative/path.ts  [Export1, Export2, ...]"
    # Skip CSS/HTML/SQL unless they look directly relevant
    index_lines = []
    for rel, meta in sorted(index.items()):
        ext = Path(rel).suffix
        if ext in {".css", ".scss", ".html", ".sql"} and not any(
            kw in rel.lower() for kw in ["sync", "peer", "setup", "onboard"]
        ):
            continue
        exports = meta.get("exports", [])
        entry   = f"{rel}  [{', '.join(exports[:6])}]" if exports else rel
        index_lines.append(entry)

    index_text = "\n".join(index_lines)

    if task_type == "bugfix":
        rules = """\
Rules:
- Select 5 to 8 files maximum — bugs are local, keep the context tight
- ALWAYS include: the specific component/page/hook where the bug occurs, its direct parent layout component, and any store or hook it reads state from
- STRONGLY PREFER: layout files (MainLayout, Sidebar, TopBar), the affected view/page component, and CSS/style utilities if the bug is visual or resize-related
- DO NOT include: crypto.ts, aiService.ts, metadataExtractor.ts, ouraService.ts, or any data-processing / AI / sync files unless the bug description explicitly mentions them
- DO NOT include: unrelated features — if the bug is a UI layout issue, exclude analytics, search, calendar, and editor files
- If in doubt, leave it out — a tight focused context helps more than a broad one
- Use the exact relative path strings from the index above"""
    elif task_type == "refactor":
        rules = """\
Rules:
- Select 8 to 12 files maximum
- ALWAYS include: the files being restructured, their direct callers/consumers, shared type definitions they export, and any routing or navigation file that references them
- ALWAYS include: App.tsx or the top-level router if the task involves settings, modals, navigation, or deep-linking — these always have cross-cutting wiring that breaks silently
- DO NOT include: unrelated features, test files, CSS files, or crypto/AI/sync utilities unless they are directly mentioned
- Prefer the files that will change over the files that merely use them
- Use the exact relative path strings from the index above"""
    else:
        rules = """\
Rules:
- Select 8 to 12 files maximum — be selective, quality over quantity
- ALWAYS include: the page/screen files that will be directly modified (e.g. SetupScreen, onboarding screens), the service and store files they call, relevant type definitions, and Rust command files for the feature
- DO NOT include: App.tsx, main.rs, index.ts barrel files, test files, CSS files, or files for unrelated features (analytics, AI, calendar, editor, etc.)
- Prefer pages and feature files over utility/helper files
- If in doubt, leave it out — irrelevant files waste the token budget
- Use the exact relative path strings from the index above"""

    system = "You are a code analyst. Respond with valid JSON only — no markdown, no explanation."
    user = f"""You are helping with a Tauri + React + TypeScript + Rust desktop app.

Given the {'bug report' if task_type == 'bugfix' else 'task description'} below and the codebase file index, select ONLY the files directly relevant to {'diagnosing and fixing the bug' if task_type == 'bugfix' else 'implementing the task'}.

{'Bug report' if task_type == 'bugfix' else 'Task description'}:
{plan_body[:5000]}

Codebase files (path  [exported symbols]):
{index_text[:8000]}

Return JSON:
{{
  "files": ["relative/path/to/file.ts", ...]
}}

{rules}"""

    toks = count_tokens(user)
    cost = estimate_cost(MODEL_CHEAP, toks, 600)
    print(f"  File selection: ~{toks:,} tokens, est. {fmt_cost(cost)}")

    raw = openai_call(system, user, max_tokens=600)
    raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
    try:
        data  = json.loads(raw)
        files = []
        for rel in data.get("files", []):
            p = (root / rel).resolve()
            if p.exists():
                files.append(p)
            else:
                print(f"  Warning: GPT selected {rel!r} — not found, skipping")
        return files
    except Exception as e:
        print(f"  Warning: could not parse file selection response: {e}")
        return []

def build_gap_context(files: list[Path], root: Path) -> str:
    """
    Build a two-part code context for the gap analysis:
      Part 1 — compact index: every file's path + first 40 lines
               so GPT knows the full landscape of what exists.
      Part 2 — full content: the first 6 files (most relevant by tier)
               so GPT can read the key implementation in detail.
    Total kept well under 60k chars.
    """
    parts = []

    # Part 1: compact index — 40 lines per file
    parts.append("=== CODEBASE INDEX (40-line summaries) ===\n")
    for fp in files:
        try:
            rel = fp.relative_to(root)
        except ValueError:
            rel = fp
        lines = fp.read_text(encoding="utf-8", errors="ignore").splitlines()[:40]
        parts.append(f"\n// FILE: {rel}\n" + "\n".join(lines) + "\n")

    parts.append("\n\n=== FULL FILE CONTENTS (most relevant files) ===\n")

    # Part 2: full content of first 6 files
    budget = 0
    for fp in files[:6]:
        try:
            rel = fp.relative_to(root)
        except ValueError:
            rel = fp
        code = trim_code(fp)
        toks = count_tokens(code)
        if budget + toks > 40_000:
            break
        budget += toks
        parts.append(f"\n// FILE: {rel}\n{code}\n")

    return "".join(parts)

def find_pattern_references(
    gap_analysis: str,
    index: dict,
    root: Path,
    already_selected: Optional[list[Path]] = None,
) -> list[tuple[Path, str]]:
    """
    After the gap analysis, look for "create" items (new files / components the plan wants).
    Ask GPT to match each new thing against the codebase index and find the best existing
    analog to use as an implementation pattern.

    already_selected: files already going into Code Context — pattern picks are deduped
    against this list so the same file doesn't appear in both sections.

    Returns a list of (path, reason) tuples — the files + a one-line note on what they show.
    """
    # Extract "new thing" lines from the gap analysis.
    create_lines = []
    for line in gap_analysis.splitlines():
        low = line.lower()
        if any(kw in low for kw in ("create", "add new", "new file", "new component", "new screen", "new hook", "new store")):
            stripped = line.strip().lstrip("-|* ").strip()
            if stripped:
                create_lines.append(stripped)

    if not create_lines:
        return []

    new_items_text = "\n".join(f"- {l}" for l in create_lines[:15])

    # Determine which new items are TypeScript vs Rust so we can filter mismatches later.
    # A new item is "rust" if it mentions .rs or "command" or "tauri command".
    def _is_rust_item(line: str) -> bool:
        low = line.lower()
        return ".rs" in low or "tauri command" in low or "rust command" in low

    rust_items  = {l for l in create_lines if _is_rust_item(l)}
    ts_items    = {l for l in create_lines if not _is_rust_item(l)}

    # Build compact index — list already-selected files FIRST so GPT strongly prefers them.
    # Label them "[ALREADY SELECTED]" so GPT knows they're the best candidates.
    selected_rels: set[str] = set()
    if already_selected:
        for fp in already_selected:
            try:
                selected_rels.add(str(fp.relative_to(root)))
            except ValueError:
                pass

    index_lines_priority = []
    index_lines_rest     = []
    for rel, meta in sorted(index.items()):
        exports = meta.get("exports", [])
        tag     = "  [ALREADY SELECTED]" if rel in selected_rels else ""
        entry   = f"{rel}{tag}  [{', '.join(exports[:5])}]" if exports else f"{rel}{tag}"
        if rel in selected_rels:
            index_lines_priority.append(entry)
        else:
            index_lines_rest.append(entry)

    # Put already-selected files first so they occupy the top of the context window
    index_text = "\n".join(index_lines_priority + index_lines_rest)

    system = "You are a code analyst. Respond with valid JSON only — no markdown, no explanation."
    user = f"""A developer is adding new files/components to a Tauri + React + TypeScript codebase.

New things to create (from gap analysis):
{new_items_text}

Codebase files (path [exported symbols]):
{index_text[:7000]}

For each new thing, find the single best existing file in the codebase that demonstrates the pattern or convention to follow when building it.

Return JSON:
{{
  "patterns": [
    {{"new_item": "...", "pattern_file": "relative/path.ts", "reason": "one sentence"}}
  ]
}}

Rules:
- STRONGLY prefer files marked [ALREADY SELECTED] — they are the most contextually relevant
- Match TypeScript/React new items (.tsx/.ts) ONLY to TypeScript files — never suggest a .rs file as a pattern for a React component or hook
- Match Rust new items (.rs) ONLY to Rust files
- Only include a match if you are confident it is a good analog — skip if no good match exists
- Do NOT match a file to itself
- Max 4 pattern references total
- Use exact relative path strings from the index"""

    toks = count_tokens(user)
    cost = estimate_cost(MODEL_CHEAP, toks, 400)
    print(f"  Pattern references: ~{toks:,} tokens, est. {fmt_cost(cost)}")

    raw = openai_call(system, user, max_tokens=500)
    raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()

    code_context_set: set[Path] = set(already_selected or [])
    results: list[tuple[Path, str]] = []
    seen_paths: set[Path] = set()
    try:
        data = json.loads(raw)
        for entry in data.get("patterns", []):
            rel       = entry.get("pattern_file", "")
            reason    = entry.get("reason", "")
            new_item  = entry.get("new_item", "")
            if not rel or not reason:
                continue
            p = (root / rel).resolve()
            if not p.exists() or p in seen_paths:
                continue
            # Fix 2: enforce language match — don't suggest .rs for TS new items or vice versa
            is_rust_pattern = p.suffix == ".rs"
            item_is_rust    = _is_rust_item(new_item)
            if is_rust_pattern != item_is_rust:
                continue
            # Fix 3: skip files already in Code Context — no duplication
            if p in code_context_set:
                continue
            seen_paths.add(p)
            results.append((p, reason))
    except Exception as e:
        print(f"  Warning: could not parse pattern references response: {e}")

    return results


_BUGFIX_KEYWORDS = {
    "fix", "bug", "broken", "crash", "error", "exception", "incorrect", "wrong",
    "not working", "doesn't work", "does not work", "fails", "failure", "when i click",
    "when clicking", "when i tap", "regression", "freeze", "hang", "infinite loop",
    "undefined", "null", "nan", "unexpected", "missing value", "not rendering",
    "not updating", "stale", "flicker", "disappears", "shows wrong",
}

_REFACTOR_KEYWORDS = {
    "refactor", "restructure", "reorganise", "reorganize", "migrate", "migration",
    "move", "split", "consolidate", "rename", "extract", "clean up", "cleanup",
    "deduplicate", "dedup", "simplify", "rewrite", "redesign", "overhaul",
    "separate", "merge into", "break out", "break into",
}

# Refactor keywords take precedence — a task can mention "fix the structure" but
# not be a bugfix. Check refactor first, then bugfix, then default to feature.
def _detect_task_type(plan: dict) -> str:
    """Return 'refactor', 'bugfix', or 'feature' based on task language."""
    text = " ".join([
        plan.get("task", ""),
        plan.get("goal", ""),
        (plan.get("body", "") or "")[:500],
    ]).lower()
    if any(kw in text for kw in _REFACTOR_KEYWORDS):
        return "refactor"
    if any(kw in text for kw in _BUGFIX_KEYWORDS):
        return "bugfix"
    return "feature"


def generate_gap_analysis(plan: dict, code_context: str, model: str) -> str:
    task         = plan.get("task", "Unnamed task")
    goal         = plan.get("goal", "")
    criteria     = plan.get("acceptance_criteria", [])
    criteria_str = "\n".join(f"- {c}" for c in criteria) if criteria else "_Not specified_"
    task_type    = _detect_task_type(plan)

    system = (
        "You are a senior engineer doing targeted code review. "
        "Be specific — reference real function names and file paths from the code provided."
    )

    if task_type == "bugfix":
        user = f"""Bug report: {task}

Description:
{goal or task}

Expected behaviour / acceptance criteria:
{criteria_str}

Codebase context (relevant files):
{code_context[:60_000]}

Produce a structured bug analysis. Use ### for all section headings (not ##). Be specific — quote actual function names, component names, prop names, event names, and Tauri command names from the code above. Use relative file paths only. Do not invent abstractions that don't exist in the codebase.

### 1. Likely Root Cause
Identify the specific function, state update, event handler, or data flow that is most likely causing the bug. Quote the relevant code by name and file.

### 2. Where in the Code
Exact file(s) and function(s) that need to change. Explain what the current behaviour is and why it's wrong.

### 3. Suggested Fix
Step-by-step. For each step, name the exact file, the specific function or line area, and what to change. Keep it minimal — don't refactor beyond what's needed.

### 4. Files to Change
| File | Function / area | What to change |
|------|-----------------|----------------|
Concrete changes only, not vague descriptions.

### 5. How to Verify the Fix
Specific manual steps or test cases that confirm the bug is resolved without introducing regressions."""

    elif task_type == "refactor":
        user = f"""Refactor task: {task}

Description:
{goal or task}

Acceptance criteria:
{criteria_str}

Codebase context (relevant files):
{code_context[:60_000]}

Produce a structured refactor analysis. Use ### for all section headings (not ##). Be specific — quote actual function names, component names, prop names, and file paths from the code above. Do not speculate about bugs or broken behaviour unless the code clearly shows a problem. Use relative file paths only.

### 1. Current Structure
Describe the current shape of the relevant code — what exists, how it's organised, what the key entry points and data flows are. Quote real names.

### 2. What Needs to Change
Specific structural changes required. For each change, name the exact file, function, or component and describe the transformation (e.g. "extract X from Y into Z", "merge A and B", "move prop X up to parent").

### 3. Suggested Order of Changes
Numbered steps that minimise broken intermediate states. Each step should leave the app in a working state if possible.

### 4. Files to Touch
| File | What changes |
|------|-------------|
Concrete changes only — no vague "update as needed".

### 5. Watch Out For
Cross-cutting concerns that are easy to miss: navigation handlers, deep-link systems, z-index stacking, event listeners that need cleanup, store subscriptions, Tauri command signatures that callers depend on."""

    else:
        user = f"""Task: {task}

Goal:
{goal or task}

Acceptance Criteria:
{criteria_str}

Codebase context (relevant files):
{code_context[:60_000]}

Produce a structured implementation analysis. Use ### for all section headings (not ##). Be specific — quote actual function names, component names, prop names, and Tauri command names from the code above. Do not invent abstractions that don't exist in the codebase. Use relative file paths only (e.g. `src/pages/SetupScreen.tsx`, not absolute paths).

### 1. What Already Exists
List the specific functions, components, Tauri commands, store actions, and hooks already implemented that are directly relevant. Use exact names from the code (e.g. `startDiscovery()`, `pairWithDevice()`, `nearbyPeers` state).

### 2. What Is Missing
Specific gaps between the current code and the task. Reference actual file names and what they currently lack.

### 3. Suggested Implementation Order
Numbered steps. For each step, name the exact file and what change to make.

### 4. Files to Create or Modify
| File | Action | What to add/change |
|------|--------|--------------------|
List each file with concrete changes, not vague descriptions.

### 5. Potential Gotchas
Specific edge cases in this codebase — Tauri event listener cleanup, store subscription patterns, Rust/TS command signatures, anything that could break existing flows."""

    toks = count_tokens(user)
    cost = estimate_cost(model, toks, 1500)
    print(f"   Gap analysis: ~{toks:,} tokens, est. {fmt_cost(cost)}")
    return openai_call(system, user, model=model, max_tokens=2000)


# ── 2. PLAN FILE PARSING ──────────────────────────────────────────────────────

def _parse_simple_frontmatter(text: str) -> dict:
    """
    Minimal YAML-like parser used when pyyaml is not installed.
    Handles simple key: value pairs and flat lists (- item).
    """
    result: dict = {}
    current_key: Optional[str] = None
    current_list: Optional[list] = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        is_list_item = line.startswith("  - ") or line.startswith("    - ")
        if is_list_item and current_list is not None:
            current_list.append(stripped.lstrip("- ").strip())
            continue
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            k, v = k.strip(), v.strip()
            if not v or v == "|":
                current_key  = k
                current_list = []
                result[k]    = current_list
            else:
                result[k]    = v
                current_key  = None
                current_list = None

    return result

def parse_plan_file(plan_path: Path) -> dict:
    """
    Parse a plan .md file. Supports optional YAML frontmatter (--- delimited).
    Without frontmatter, treats the entire file as the goal/body text.

    Returned dict keys:
      task, goal, relevant_files, relevant_dirs, keywords, acceptance_criteria, body
    """
    content = plan_path.read_text(encoding="utf-8")
    plan: dict = {
        "task":                plan_path.stem.replace("-", " ").replace("_", " ").title(),
        "goal":                "",
        "relevant_files":      [],
        "relevant_dirs":       [],
        "keywords":            [],
        "acceptance_criteria": [],
        "body":                content,
    }

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text      = parts[1]
            plan["body"] = parts[2].strip()
            try:
                fm = yaml.safe_load(fm_text) if HAS_YAML else _parse_simple_frontmatter(fm_text)
                for k, v in (fm or {}).items():
                    if v:
                        plan[k] = v
            except Exception as e:
                print(f"Warning: could not parse frontmatter: {e}")
    else:
        # Plain markdown — use the full content as body only (not goal)
        # so it appears once in the bundle, not duplicated.
        plan["body"] = content

    return plan


# ── SCAN MODE ─────────────────────────────────────────────────────────────────

_SCAN_PROMPT = """\
Review the following code from a software project.

Return a concise list of high-level improvement opportunities:
- Security risks
- Maintainability improvements
- Performance concerns
- Testing gaps
- Structural or architectural improvements

Be brief. No line-by-line commentary.

Code:
```
{code}
```"""

def _collect_unique_files(
    folder: Path, changed_only: Optional[set[Path]] = None
) -> dict[str, list[Path]]:
    hash_map: dict[str, list[Path]] = {}
    for root_str, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            p = Path(root_str) / name
            if changed_only is not None and p.resolve() not in changed_only:
                continue
            if is_source_file(p):
                h = hash_file(p)
                if h:
                    hash_map.setdefault(h, []).append(p)
    return hash_map

def _batch_files_for_scan(unique_files: dict) -> list:
    batches: list = []
    current: list = []
    size = 0
    for files in unique_files.values():
        code  = trim_code(files[0])
        block = f"\n// FILE: {files[0]}\n{code}\n"
        if size + len(block) > MAX_CHARS_PER_BATCH and current:
            batches.append(current)
            current, size = [], 0
        current.append((block, files))
        size += len(block)
    if current:
        batches.append(current)
    return batches

def _process_folder_scan(
    folder: Path, idx: int, total: int, changed_only: Optional[set[Path]]
) -> tuple[str, str, int]:
    out_file = OUTPUT_DIR / f"{folder.name}_improvements.md"
    if out_file.exists():
        print(f"[{idx}/{total}] Skip {folder.name} (already scanned)")
        return ("skipped", folder.name, 0)

    print(f"[{idx}/{total}] {folder.name}")
    unique = _collect_unique_files(folder, changed_only)
    if not unique:
        return ("skipped", folder.name, 0)

    batches  = _batch_files_for_scan(unique)
    feedback = ""
    for b_idx, batch in enumerate(batches, 1):
        code = "\n".join(blk for blk, _ in batch)
        toks = count_tokens(code)
        cost = estimate_cost(MODEL_CHEAP, toks, 800)
        print(f"   batch {b_idx}/{len(batches)} — ~{toks:,} tok, est. {fmt_cost(cost)}")
        result    = openai_call(
            "You are a senior software engineer performing code review.",
            _SCAN_PROMPT.format(code=code),
            max_tokens=800,
        )
        file_list = "\n".join(", ".join(str(f) for f in fs) for _, fs in batch)
        feedback += f"## Batch {b_idx}\n\nFiles:\n{file_list}\n\n{result}\n\n"

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file.write_text(f"# Improvements for {folder}\n\n{feedback}", encoding="utf-8")
    return ("scanned", folder.name, len(batches))

def run_scan(args: argparse.Namespace) -> None:
    cwd     = Path.cwd()
    changed: Optional[set[Path]] = None

    # 5. Git-diff mode
    if args.since:
        changed = get_changed_files(args.since)
        print(f"Git-diff mode: {len(changed)} changed file(s) since {args.since!r}")

    print(f"Scanning: {cwd}")
    if input("Continue? (y/n): ").lower() != "y":
        sys.exit(0)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    folders = [f for f in cwd.iterdir() if f.is_dir() and f.name not in SKIP_DIRS]
    scanned:    list[str]      = []
    skipped:    list[str]      = []
    batches_map: dict[str, int] = {}

    with ThreadPoolExecutor(max_workers=THREAD_WORKERS) as ex:
        futs = [
            ex.submit(_process_folder_scan, f, i, len(folders), changed)
            for i, f in enumerate(folders, 1)
        ]
        for fut in futs:
            status, name, nb = fut.result()
            if status == "scanned":
                scanned.append(name)
                batches_map[name] = nb
            else:
                skipped.append(name)

    summary = OUTPUT_DIR / "scan_summary.md"
    lines = [
        "# Scan Summary\n\n",
        f"Folders scanned: {len(scanned)}\n\n",
        f"Folders skipped: {len(skipped)}\n\n",
        "## Scanned\n",
        *[f"- {s}: {batches_map[s]} batch(es)\n" for s in scanned],
        "\n## Skipped\n",
        *[f"- {s}\n" for s in skipped],
    ]
    summary.write_text("".join(lines), encoding="utf-8")
    print(f"\nDone. Results in {OUTPUT_DIR}/")


# ── CONTEXT MODE ──────────────────────────────────────────────────────────────

def _resolve_context_files(plan: dict, root: Path, index: dict) -> list[Path]:
    """
    Gather relevant files from three sources, in order:
      1. Explicitly listed relevant_files in the plan
      2. Recursive scan of relevant_dirs listed in the plan
      3. Keyword search across the codebase index
    """
    found: set[Path] = set()

    # 1. Explicit files
    for rel in plan.get("relevant_files", []):
        p = (root / rel).resolve()
        if p.exists():
            found.add(p)
        else:
            print(f"  Warning: plan lists {rel!r} — file not found")

    # 2. Explicit directories
    for rel_dir in plan.get("relevant_dirs", []):
        d = (root / rel_dir).resolve()
        if d.is_dir():
            for f in d.rglob("*"):
                if f.is_file() and is_source_file(f):
                    found.add(f)

    # 3. Keyword search in index
    keywords = plan.get("keywords", [])
    if keywords:
        matched = search_index(index, keywords, root)
        found.update(matched)
        preview = keywords[:4]
        ellipsis = "…" if len(keywords) > 4 else ""
        print(f"  Keyword search ({preview}{ellipsis}): {len(matched)} file(s)")

    return sorted(found)

def _build_context_bundle(
    plan: dict,
    files: list[Path],
    gap_analysis: str,
    root: Path,
    pattern_files: Optional[list[tuple[Path, str]]] = None,
    slim: bool = False,
) -> str:
    """
    Assemble the full Claude-ready context bundle as a Markdown string.
    Includes: task, acceptance criteria, gap analysis, optional pattern references,
    and code files.

    slim=True: replaces full file dumps with a compact manifest (path + 10-line preview).
    Use when pasting into Claude Code, which can read files directly.
    Default (False): includes full file content, suitable for paste-into-chat.
    """
    task         = plan.get("task", "Unnamed task")
    goal         = plan.get("goal", "")
    criteria     = plan.get("acceptance_criteria", [])
    body         = plan.get("body", "")
    criteria_str = "\n".join(f"- {c}" for c in criteria) if criteria else "_Not specified_"
    task_type    = _detect_task_type(plan)

    # Use body if set, otherwise fall back to goal, otherwise task name.
    main_text = (body or goal or task).strip()

    gap_section_title = (
        "Bug Analysis (GPT)"    if task_type == "bugfix"
        else "Refactor Analysis (GPT)" if task_type == "refactor"
        else "Gap Analysis (GPT)"
    )
    criteria_label = (
        "## Expected Behaviour\n\n"   if task_type == "bugfix"
        else "## Acceptance Criteria\n\n"
    )

    sections = [
        f"# Context Bundle: {task}\n",
        "_Generated by ai_code_scan.py — paste into Claude for implementation_\n\n",
        "---\n\n",
        "## Task\n\n",
        # Wrap in a tilde fence (~~~) not backtick fence (```).
        # The plan body contains its own ``` code blocks; a backtick outer fence
        # would be closed by the first inner ``` it encounters. Tilde and backtick
        # fences are independent in CommonMark so inner ``` can't close ~~~.
        f"~~~markdown\n{main_text}\n~~~\n\n",
        criteria_label,
        f"{criteria_str}\n\n",
        "---\n\n",
        f"## {gap_section_title}\n\n",
        # Strip any ## -level heading GPT prefixed before its ### sections —
        # it collides with the bundle's own section title above.
        f"{re.sub(r'^##[^#][^\n]*\n', '', gap_analysis, flags=re.MULTILINE).strip()}\n\n",
        "---\n\n",
    ]

    # Pattern references section — only added when new files/features were detected.
    # Capped at 15k tokens so it doesn't crowd out Code Context.
    if pattern_files:
        sections.append(
            "## Pattern References\n\n"
            "_Existing files that show the conventions to follow for new components_\n\n"
        )
        pat_budget = 0
        for fp, reason in pattern_files:
            try:
                rel = fp.relative_to(root)
            except ValueError:
                rel = fp  # type: ignore[assignment]
            ext  = fp.suffix.lstrip(".")
            code = trim_code(fp)
            toks = count_tokens(code)
            if pat_budget + toks > 15_000:
                sections.append(f"_`{rel}` omitted (pattern budget reached)_\n\n")
                continue
            pat_budget += toks
            sections.append(f"### `{rel}`\n\n_{reason}_\n\n```{ext}\n{code}\n```\n\n")
        sections.append("---\n\n")

    if slim:
        # ── Slim mode: flat file list ─────────────────────────────────────────
        # Intended for Claude Code, which can read files directly.
        # Just paths + token counts — no content, no previews.
        # Claude reads the files itself using its tools.
        sections.append(
            "## Files to Read\n\n"
            "_Slim mode — read these files directly before implementing._\n\n"
        )
        for fp in files:
            try:
                rel = fp.relative_to(root)
            except ValueError:
                rel = fp  # type: ignore[assignment]
            toks = count_tokens(trim_code(fp))
            sections.append(f"- `{rel}` (~{toks:,} tokens)\n")
        sections.append(f"\n_Total: {len(files)} files_\n")
    else:
        # ── Full mode: complete file content ─────────────────────────────────
        sections.append("## Code Context\n\n")
        budget  = 0
        omitted = []
        for fp in files:
            try:
                rel = fp.relative_to(root)
            except ValueError:
                rel = fp  # type: ignore[assignment]
            ext  = fp.suffix.lstrip(".")
            code = trim_code(fp)
            toks = count_tokens(code)
            if budget + toks > MAX_CONTEXT_TOKENS:
                omitted.append(str(rel))
                continue
            budget += toks
            sections.append(f"### `{rel}`\n\n```{ext}\n{code}\n```\n\n")

        if omitted:
            sections.append(
                f"_Files omitted (token budget reached): {', '.join(omitted)}_\n\n"
            )
        sections.append(f"\n---\n_Total code context: ~{budget:,} tokens_\n")

    return "".join(sections)

def run_context(args: argparse.Namespace) -> None:
    root  = Path.cwd()
    model = args.model

    # ── Load / build plan ───────────────────────────────────────────────────
    if args.plan:
        plan_path = Path(args.plan)
        if not plan_path.exists():
            print(f"Plan file not found: {plan_path}")
            sys.exit(1)
        print(f"Loading plan: {plan_path}")
        plan = parse_plan_file(plan_path)
        print(f"  Task: {plan['task']}")
        if plan.get("keywords"):
            print(f"  Plan keywords: {plan['keywords']}")

    elif args.task:
        plan = {
            "task":                args.task[:80],
            "goal":                args.task,
            "relevant_files":      [],
            "relevant_dirs":       [],
            "keywords":            [],
            "acceptance_criteria": [],
            "body":                args.task,
        }

    else:
        print("context mode requires --plan <file> or --task <description>")
        sys.exit(1)

    # ── Build / load codebase index ─────────────────────────────────────────
    index = load_or_build_index(root, force=args.rebuild_index)

    # ── Resolve relevant files ───────────────────────────────────────────────
    # Always run GPT semantic file selection — it finds the feature-specific files.
    # Frontmatter relevant_files are guaranteed additions merged on top.
    # The two sources complement each other: GPT for breadth, frontmatter for precision.
    print("\nResolving relevant files...")

    plan_body = plan.get("body") or plan.get("goal") or ""
    if not plan_body:
        print("Error: plan has no content to analyse.")
        sys.exit(1)

    task_type = _detect_task_type(plan)
    print(f"  Task type: {task_type}")
    print("  Running GPT file selection from codebase index...")
    gpt_files = select_files_from_plan(plan_body, index, root, task_type=task_type)

    # For bugfix mode: hard-filter noise files GPT commonly includes despite instructions.
    # Also cap to 8 files to prevent context bloat.
    if task_type == "bugfix":
        _noise = {"App.tsx", "main.rs", "main.tsx"}
        _noise_patterns = {"/index.ts", "/index.tsx"}
        gpt_files = [
            f for f in gpt_files
            if f.name not in _noise
            and not any(str(f).endswith(p) for p in _noise_patterns)
        ][:8]

    print(f"  GPT selected: {len(gpt_files)} file(s)")

    # Merge frontmatter explicit files + --pin CLI flags with GPT selection
    pinned = set()
    for rel in list(plan.get("relevant_files", [])) + list(args.pin):
        p = (root / rel).resolve()
        if p.exists():
            pinned.add(p)
        else:
            print(f"  Warning: plan lists {rel!r} — file not found")

    if plan.get("relevant_dirs"):
        for rel_dir in plan.get("relevant_dirs", []):
            d = (root / rel_dir).resolve()
            if d.is_dir():
                for f in d.rglob("*"):
                    if f.is_file() and is_source_file(f):
                        pinned.add(f)

    if plan.get("keywords"):
        matched = search_index(index, plan["keywords"], root)
        pinned.update(matched)

    # ── Navigation/routing auto-pin heuristic ────────────────────────────────
    # For refactor tasks touching settings, modals, or navigation, force-include
    # App.tsx and any file exporting navigation/routing handlers.
    # These contain cross-cutting wiring (deep-links, handleNavigate, scrollToSection)
    # that GPT misses because they're not in the feature's own files.
    _nav_trigger_words = {
        "settings", "modal", "navigation", "deep-link", "deeplink",
        "scroll-to", "scrollto", "tab", "routing", "navigate",
    }
    plan_text_lower = (plan_body + plan.get("task", "")).lower()
    if task_type == "refactor" and any(w in plan_text_lower for w in _nav_trigger_words):
        for candidate_rel in index:
            p = (root / candidate_rel).resolve()
            name = Path(candidate_rel).stem.lower()
            if name == "app" and p.suffix in {".tsx", ".ts"}:
                pinned.add(p)
                continue
            exports = " ".join(index[candidate_rel].get("exports", [])).lower()
            if any(kw in exports for kw in ("handlenavigate", "scrolltosection", "setview", "navigate")):
                pinned.add(p)

    if pinned:
        new_pins = pinned - set(gpt_files)
        if new_pins:
            print(f"  Frontmatter added: {len(new_pins)} pinned file(s)")

    direct_files = list(pinned | set(gpt_files))
    direct_set   = set(direct_files)

    # ── Import tracing ───────────────────────────────────────────────────────
    # Order: pages/components first, then services/stores, then types, then deps.
    # This ensures the gap analysis and token budget hit the most important files first.
    def _relevance_tier(p: Path) -> int:
        s = str(p)
        if "/pages/" in s:       return 0
        if "/components/" in s:  return 1
        if "/hooks/" in s:       return 2
        if "/stores/" in s:      return 3
        if "/lib/" in s:         return 4
        if "/types/" in s:       return 5
        if "/commands/" in s:    return 6
        return 7

    direct_files = sorted(direct_files, key=_relevance_tier)
    all_files    = direct_files

    if not args.no_trace and task_type != "bugfix":
        # Only trace imports from focused feature files, not broad entry points
        # (pages and top-level screens import dozens of unrelated things).
        # Skipped for bugfix mode — bugs are local, tracing pulls in unrelated pages.
        # Also skip App.tsx and root entry points — they import the entire app
        # and tracing from them produces hundreds of unrelated deps.
        _root_entry_names = {"App.tsx", "App.ts", "main.tsx", "main.ts"}
        traceable = [
            f for f in direct_files
            if f.stat().st_size < 30_000
            and "/pages/" not in str(f)
            and f.name not in _root_entry_names
        ]
        deps = trace_imports(traceable, depth=args.depth)
        deps = sorted([d for d in deps if d not in direct_set], key=_relevance_tier)
        all_files = direct_files + deps
        if deps:
            print(f"  Import tracing (depth={args.depth}): +{len(deps)} dependency file(s)")
    elif task_type == "bugfix" and not args.no_trace:
        print("  Import tracing: skipped (bugfix mode — use --no-trace to suppress this message or remove to re-enable)")

    if not all_files:
        print("\nNo files found. Try broadening keywords or check --plan / --task.")
        sys.exit(1)

    # ── Preview table ────────────────────────────────────────────────────────
    print(f"\n{'File':<70} {'~Tokens':>8}  Source")
    print("-" * 90)
    total_preview_toks = 0
    for fp in all_files:
        try:
            rel = str(fp.relative_to(root))
        except ValueError:
            rel = str(fp)
        toks = count_tokens(trim_code(fp))
        total_preview_toks += toks
        source = "direct" if fp in direct_set else "import dep"
        print(f"  {rel:<68} {toks:>8,}  {source}")

    gap_input_toks = total_preview_toks + 600   # rough prompt overhead
    gap_cost       = estimate_cost(model, gap_input_toks, 1500)
    print(f"\n  Total: {total_preview_toks:,} tokens across {len(all_files)} file(s)")
    print(f"  Gap analysis cost: ~{fmt_cost(gap_cost)} (model: {model})")

    if not HAS_TIKTOKEN:
        print("  Note: install tiktoken for accurate token counts (pip install tiktoken)")

    if input("\nContinue? (y/n): ").lower() != "y":
        sys.exit(0)

    # ── Gap analysis (the valuable GPT step) ────────────────────────────────
    print("\nRunning gap analysis...")
    code_context = build_gap_context(all_files, root)
    gap_analysis = generate_gap_analysis(plan, code_context, model)

    # ── Pattern references — find analogs for new files the plan wants ───────
    pattern_files: list[tuple[Path, str]] = []
    print("Finding pattern references...")
    pattern_files = find_pattern_references(gap_analysis, index, root, already_selected=all_files)
    if pattern_files:
        print(f"  Found {len(pattern_files)} pattern reference(s):")
        for fp, reason in pattern_files:
            try:
                rel = fp.relative_to(root)
            except ValueError:
                rel = fp
            print(f"    {rel}  — {reason}")
    else:
        print("  No new file patterns needed (all required files already exist)")

    # ── Build Claude-ready context bundle ────────────────────────────────────
    if args.slim:
        print("Building context bundle (slim mode — file manifest only)...")
    else:
        print("Building context bundle...")
    bundle = _build_context_bundle(plan, all_files, gap_analysis, root, pattern_files, slim=args.slim)

    # ── Write output ─────────────────────────────────────────────────────────
    BUNDLES_DIR.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^\w]+", "-", plan["task"].lower()).strip("-")[:50]
    out  = BUNDLES_DIR / f"{slug}_context.md"
    out.write_text(bundle, encoding="utf-8")

    bundle_toks = count_tokens(bundle)
    print(f"\nContext bundle written: {out}")
    print(f"Bundle size: ~{bundle_toks:,} tokens")
    print("Paste into Claude to implement.")


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AI Codebase Scanner v2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ai_code_scan.py
  python ai_code_scan.py --mode scan --since HEAD~5
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md
  python ai_code_scan.py --mode context --task "Add P2P sync to setup screen"
  python ai_code_scan.py --mode context --task "..." --model gpt-4o
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md --no-trace
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md --rebuild-index
  python ai_code_scan.py --mode context --task "fix resize bug" --pin src/pages/WritingView.tsx
  python ai_code_scan.py --mode context --plan docs/plans/phase5.md --slim
        """,
    )

    parser.add_argument(
        "--mode", choices=["scan", "context"], default="scan",
        help="Operation mode (default: scan)",
    )

    # ── scan flags ──────────────────────────────────────────────────────────
    parser.add_argument(
        "--since", metavar="COMMIT",
        help="scan: only process files changed since this git ref (e.g. HEAD~5, main)",
    )

    # ── context flags ────────────────────────────────────────────────────────
    parser.add_argument(
        "--plan", metavar="FILE",
        help="context: path to plan .md file (supports YAML frontmatter)",
    )
    parser.add_argument(
        "--task", metavar="TEXT",
        help="context: free-text task description (alternative to --plan)",
    )
    parser.add_argument(
        "--model", default=MODEL_CHEAP, metavar="MODEL",
        help=f"OpenAI model for gap analysis (default: {MODEL_CHEAP})",
    )
    parser.add_argument(
        "--depth", type=int, default=2, metavar="N",
        help="context: import tracing depth (default: 2)",
    )
    parser.add_argument(
        "--no-trace", action="store_true",
        help="context: skip import tracing",
    )
    parser.add_argument(
        "--rebuild-index", action="store_true",
        help="Force rebuild of the codebase index cache",
    )
    parser.add_argument(
        "--pin", metavar="FILE", action="append", default=[],
        help="context: force-include a file regardless of GPT selection (repeatable)",
    )
    parser.add_argument(
        "--slim", action="store_true",
        help="context: output file manifest + 10-line previews instead of full file content (use with Claude Code)",
    )

    args = parser.parse_args()

    # Auto-switch to context mode if --plan or --task is provided without --mode
    if args.mode == "scan" and (args.plan or args.task):
        args.mode = "context"

    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY not set")
        sys.exit(1)

    if not HAS_TIKTOKEN:
        print("Note: tiktoken not installed — using char/4 token estimate. `pip install tiktoken` for accuracy.\n")

    if args.mode == "scan":
        run_scan(args)
    elif args.mode == "context":
        run_context(args)


if __name__ == "__main__":
    main()
