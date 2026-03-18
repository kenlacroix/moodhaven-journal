#!/usr/bin/env python3
"""
MoodBloom Security Audit CLI
-----------------------------
Performs automated, AI-powered security audits on the MoodBloom codebase.

Usage:
  python3 scripts/security_audit.py
  python3 scripts/security_audit.py --focus crypto
  python3 scripts/security_audit.py --focus network
  python3 scripts/security_audit.py --focus full --output markdown
  python3 scripts/security_audit.py --focus full --output json
  python3 scripts/security_audit.py --focus full --deep
  python3 scripts/security_audit.py --path /custom/path --output console
  python3 scripts/security_audit.py --provider openai
  python3 scripts/security_audit.py --provider openai --model o3
  python3 scripts/security_audit.py --batch                         # audit ALL files in chunks
  python3 scripts/security_audit.py --batch --batch-size 60000      # smaller chunks for low-TPM accounts

Providers:
  anthropic  Uses claude-opus-4-6 with adaptive thinking (ANTHROPIC_API_KEY)
  openai     Uses gpt-4o by default; pass --model o3 for deeper analysis (OPENAI_API_KEY)

Batch mode:
  Splits the full codebase into multiple context windows and audits each chunk
  independently, then synthesises all findings into one combined report.
  Covers far more files than single-shot mode (typically 3-5x more).

Dependencies:
  pip install anthropic openai
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

try:
    import openai as openai_sdk
except ImportError:
    openai_sdk = None  # type: ignore[assignment]

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

# Anthropic defaults
ANTHROPIC_MODEL = "claude-opus-4-6"
ANTHROPIC_MAX_TOKENS = 8000

# OpenAI defaults
OPENAI_MODEL = "gpt-4o"
OPENAI_MAX_TOKENS = 4000
# o3/o4-mini use the 'reasoning' effort parameter instead of temperature
OPENAI_REASONING_MODELS = {"o1", "o3", "o4-mini", "o1-mini", "o1-preview"}

# Context budget per provider.
# Anthropic claude-opus-4-6: 200k token window — use generously.
# OpenAI gpt-4o tier-1 accounts: 30k TPM hard cap.
#   ~500 tokens system prompt + ~500 tokens template + 4k response = ~5k overhead
#   → cap context at 20k tokens ≈ 80k chars to stay under 30k TPM.
ANTHROPIC_MAX_CONTEXT_CHARS = 180_000
OPENAI_MAX_CONTEXT_CHARS = 80_000

SECURITY_REPORT_DIR = "docs/security_reports"

# File extensions to scan
SCANNABLE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".rs", ".py", ".json", ".env", ".toml", ".md"}

# Directories to skip
SKIP_DIRS = {
    "node_modules", "target", ".git", "dist", "build", ".next",
    "coverage", "__pycache__", ".cache", "vendor",
}

# ─────────────────────────────────────────────
# Focus-area keyword patterns
# ─────────────────────────────────────────────

CRYPTO_KEYWORDS = [
    r"encrypt", r"decrypt", r"cipher", r"aes", r"gcm", r"nonce", r"iv\b",
    r"hmac", r"hash", r"pbkdf", r"argon", r"salt\b", r"key\b", r"crypto",
    r"sign\b", r"verify\b", r"signature", r"random", r"secret", r"password",
    r"token\b", r"jwt", r"totp", r"recovery.?key", r"master.?key",
]

NETWORK_KEYWORDS = [
    r"mdns", r"dns.?sd", r"socket", r"websocket", r"ws\b", r"wss\b",
    r"tcp", r"udp", r"bind\b", r"listen\b", r"accept\b", r"connect\b",
    r"peer", r"pairing", r"trusted.?device", r"discovery", r"broadcast",
    r"webdav", r"http\b", r"https\b", r"fetch\b", r"request\b",
    r"cors", r"csp", r"capability", r"permission",
    r"replay", r"nonce", r"challenge", r"handshake",
]

STORAGE_KEYWORDS = [
    r"localStorage", r"sessionStorage", r"indexedDB",
    r"sqlite", r"database", r"rusqlite", r"db\.",
    r"console\.log", r"println!", r"eprintln!", r"debug!",
    r"store\b", r"cache\b", r"persist",
    r"\.env", r"process\.env", r"std::env",
]

FOCUS_KEYWORDS = {
    "crypto":  CRYPTO_KEYWORDS,
    "network": NETWORK_KEYWORDS,
    "full":    CRYPTO_KEYWORDS + NETWORK_KEYWORDS + STORAGE_KEYWORDS,
}

# ─────────────────────────────────────────────
# System prompt for the AI audit
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior application security engineer performing a thorough security audit.
You specialise in:
- Cryptographic protocol analysis (AES-GCM, PBKDF2, ECDH, Ed25519, TOTP, FIDO2)
- Local-first application security and zero-knowledge architectures
- LAN/P2P protocol security (mDNS, WebSocket, device pairing, trust models)
- Rust memory and concurrency security
- TypeScript/React frontend security (XSS, injection, insecure storage)
- Tauri/Electron-class desktop app security models

Your findings must be:
- Concrete and exploitable, not theoretical hand-waving
- Referenced to actual code snippets you can see in the context
- Prioritised by real-world impact
- Accompanied by specific, actionable fixes

Severity definitions:
  CRITICAL — Exploitable with no user interaction, leads to full data compromise or RCE
  HIGH     — Exploitable with minimal effort, significant data exposure
  MEDIUM   — Requires specific conditions, moderate data exposure
  LOW      — Minor issue, defence-in-depth, best practice violation
  INFO     — Observation or improvement, no immediate security impact
"""

AUDIT_PROMPT_TEMPLATE = """
You are auditing MoodBloom, a cross-platform Tauri desktop journaling app with:
- AES-256-GCM encryption for journal entries (TypeScript + Rust)
- PBKDF2 (600k iterations) key derivation
- Local-first zero-knowledge architecture — no server holds plaintext
- LAN peer sync: Ed25519 device identity, mDNS discovery, TCP sync engine
  with AES-GCM transport (SHA-256 derived shared key)
- Optional TOTP + native FIDO2 hardware key (2FA)
- Optional recovery key (24-char, encrypts password copy)
- WebDAV cloud sync (client-side encrypted before upload)

Focus area: **{focus}**

Below is the relevant source code extracted from the codebase.
Search for real vulnerabilities — especially subtle ones that static linters would miss.

{context}

---

Produce a security audit report in this EXACT markdown structure:

## Executive Summary
[2–4 sentence overview of the security posture]

## Top 5 Critical Risks
[Numbered list of the most severe findings by impact]

## Detailed Findings

For EACH finding use:
### [SEVERITY] Finding Title
**Location:** `file:line` or file name
**CWE:** CWE-XXX (if applicable)

**Problem:**
[Precise description of the vulnerability]

**Attack Scenario:**
[Concrete exploit walkthrough — who does what, what they gain]

**Fix:**
```[language]
// specific code fix
```

## Severity Summary
| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH     | N |
| MEDIUM   | N |
| LOW      | N |
| INFO     | N |

## Recommendations
[3–5 prioritised action items for the development team]
"""

DEEP_AUDIT_PROMPT = """
Assume all findings from the first audit pass have been fixed.
Now perform a second-pass adversarial audit:

1. **Protocol-level attacks** — Can an attacker on the LAN manipulate the sync protocol?
2. **Cryptographic protocol composition** — Are the crypto primitives composed safely together?
3. **Side-channel / timing** — Any timing oracle or cache-timing risks?
4. **Trust boundary violations** — Can a malicious peer escalate privileges?
5. **Denial of service** — Can an attacker crash or lock out a device?
6. **Recovery path attacks** — Weaknesses in the password recovery flow?

Previous findings for context:
{previous_findings}

Second-pass findings (use same DETAILED FINDINGS format):
"""

BATCH_PROMPT_TEMPLATE = """
You are auditing MoodBloom (Tauri desktop journaling app, zero-knowledge architecture).
Focus area: **{focus}**
This is **batch {batch_num} of {batch_total}** — a subset of the codebase.

Audit ONLY the files shown below. Do not speculate about files not included.
Flag every real vulnerability you can see. Be concrete — cite file and line number.

{context}

---

Use this EXACT structure for your findings (skip sections with no findings):

## Batch {batch_num} Findings

For EACH finding:
### [SEVERITY] Finding Title
**Location:** `file:line`
**CWE:** CWE-XXX

**Problem:** [precise description]
**Attack Scenario:** [concrete exploit]
**Fix:**
```[language]
// code fix
```

## Severity Summary
| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH     | N |
| MEDIUM   | N |
| LOW      | N |
| INFO     | N |

If no findings: write "No findings in this batch."
"""

SYNTHESIS_PROMPT = """
You are a senior security engineer synthesising findings from a multi-batch codebase audit.
Below are raw findings from {batch_total} batches covering the full MoodBloom codebase.

{all_findings}

---

Produce a final consolidated security report:

## Executive Summary
[2–4 sentence overview of the overall security posture]

## Top 5 Critical Risks
[Numbered list — pick the highest-impact findings across all batches]

## Consolidated Findings
[Deduplicate: if multiple batches flagged the same issue, merge into one entry.
 Keep all distinct findings. Use the standard ### [SEVERITY] format.]

## Severity Summary (Combined)
| Severity | Count |
|----------|-------|
| CRITICAL | N |
| HIGH     | N |
| MEDIUM   | N |
| LOW      | N |
| INFO     | N |

## Recommendations
[3–5 prioritised action items]
"""

# ─────────────────────────────────────────────
# File scanning
# ─────────────────────────────────────────────

def is_relevant_file(filepath: Path, keywords: list[str]) -> bool:
    """Return True if the file contains any of the focus keywords."""
    try:
        text = filepath.read_text(encoding="utf-8", errors="ignore")
        pattern = "|".join(keywords)
        return bool(re.search(pattern, text, re.IGNORECASE))
    except (OSError, PermissionError):
        return False


def scan_codebase(root: Path, focus: str) -> dict[str, str]:
    """
    Walk the codebase and collect relevant file contents.
    Returns {relative_path: content}.
    """
    keywords = FOCUS_KEYWORDS[focus]
    collected: dict[str, str] = {}

    for path in root.rglob("*"):
        # Skip unwanted directories
        if any(skip in path.parts for skip in SKIP_DIRS):
            continue
        if not path.is_file():
            continue
        if path.suffix not in SCANNABLE_EXTENSIONS:
            continue

        if is_relevant_file(path, keywords):
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                rel = str(path.relative_to(root))
                collected[rel] = content
            except (OSError, PermissionError):
                pass

    return collected


def build_context_bundle(files: dict[str, str], max_chars: int) -> tuple[str, list[str]]:
    """
    Pack file contents into a context string up to max_chars.
    Returns (context_string, list_of_included_files).
    """
    # Prioritise security-critical files
    priority_patterns = [
        r"crypto", r"encrypt", r"key", r"auth", r"peer_sync",
        r"peer_pairing", r"peer_identity", r"hardware_key",
        r"two_factor", r"recovery", r"data_management",
    ]

    def priority(name: str) -> int:
        lower = name.lower()
        for i, pat in enumerate(priority_patterns):
            if re.search(pat, lower):
                return i
        return len(priority_patterns)

    sorted_files = sorted(files.items(), key=lambda kv: priority(kv[0]))

    parts: list[str] = []
    included: list[str] = []
    total = 0

    for rel_path, content in sorted_files:
        header = f"\n\n{'='*60}\nFILE: {rel_path}\n{'='*60}\n"
        snippet = (header + content)[:20_000]  # cap single file at 20k chars
        if total + len(snippet) > max_chars:
            # Include a truncated version if we have space for at least a header
            remaining = max_chars - total
            if remaining > len(header) + 200:
                parts.append(snippet[:remaining])
                included.append(rel_path + " (truncated)")
            break
        parts.append(snippet)
        included.append(rel_path)
        total += len(snippet)

    return "".join(parts), included


def split_into_batches(
    files: dict[str, str], batch_size: int
) -> list[tuple[str, list[str]]]:
    """
    Divide all files into sequential batches of up to batch_size chars each.
    Each batch is a (context_string, [file_names]) tuple.
    Files are priority-sorted (same order as build_context_bundle) then packed greedily.
    """
    priority_patterns = [
        r"crypto", r"encrypt", r"key", r"auth", r"peer_sync",
        r"peer_pairing", r"peer_identity", r"hardware_key",
        r"two_factor", r"recovery", r"data_management",
    ]

    def priority(name: str) -> int:
        lower = name.lower()
        for i, pat in enumerate(priority_patterns):
            if re.search(pat, lower):
                return i
        return len(priority_patterns)

    sorted_files = sorted(files.items(), key=lambda kv: priority(kv[0]))

    batches: list[tuple[str, list[str]]] = []
    current_parts: list[str] = []
    current_names: list[str] = []
    current_size = 0

    for rel_path, content in sorted_files:
        header = f"\n\n{'='*60}\nFILE: {rel_path}\n{'='*60}\n"
        snippet = (header + content)[:20_000]  # cap single file at 20k chars
        chunk_size = len(snippet)

        if current_size + chunk_size > batch_size and current_parts:
            # Flush current batch
            batches.append(("".join(current_parts), current_names))
            current_parts, current_names, current_size = [], [], 0

        current_parts.append(snippet)
        current_names.append(rel_path)
        current_size += chunk_size

    if current_parts:
        batches.append(("".join(current_parts), current_names))

    return batches


# ─────────────────────────────────────────────
# AI audit engine — Anthropic
# ─────────────────────────────────────────────

def run_audit_anthropic(client: "anthropic.Anthropic", context: str, focus: str, model: str, max_tokens: int) -> str:
    """Run audit via Anthropic Claude (streaming)."""
    prompt = AUDIT_PROMPT_TEMPLATE.format(focus=focus, context=context)
    print(f"  Sending to Claude ({model}, streaming)...", flush=True)

    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        result_parts: list[str] = []
        for event in stream:
            if (
                event.type == "content_block_delta"
                and hasattr(event.delta, "type")
                and event.delta.type == "text_delta"
            ):
                result_parts.append(event.delta.text)
                print(".", end="", flush=True)
        stream.get_final_message()

    print()
    return "".join(result_parts)


def run_deep_audit_anthropic(client: "anthropic.Anthropic", previous_findings: str, model: str, max_tokens: int) -> str:
    """Second-pass adversarial audit via Claude."""
    prompt = DEEP_AUDIT_PROMPT.format(previous_findings=previous_findings[:8000])
    print("  [--deep] Running second-pass adversarial audit...", flush=True)

    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        result_parts: list[str] = []
        for event in stream:
            if (
                event.type == "content_block_delta"
                and hasattr(event.delta, "type")
                and event.delta.type == "text_delta"
            ):
                result_parts.append(event.delta.text)
                print(".", end="", flush=True)

    print()
    return "".join(result_parts)


# ─────────────────────────────────────────────
# AI audit engine — OpenAI
# ─────────────────────────────────────────────

def _openai_create(client: "openai_sdk.OpenAI", model: str, max_tokens: int,
                   system: str, user: str, max_retries: int = 4) -> str:
    """
    Streaming OpenAI request with exponential backoff on rate limits.
    Handles both standard and reasoning (o-series) models.
    """
    import time

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    is_reasoning = model in OPENAI_REASONING_MODELS

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if is_reasoning:
        # o-series models use max_completion_tokens, not max_tokens
        kwargs["max_completion_tokens"] = max_tokens
    else:
        kwargs["max_tokens"] = max_tokens

    for attempt in range(max_retries + 1):
        try:
            result_parts: list[str] = []
            stream = client.chat.completions.create(**kwargs)
            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    result_parts.append(delta.content)
                    print(".", end="", flush=True)
            print()
            return "".join(result_parts)

        except openai_sdk.RateLimitError as e:
            # "Request too large" is a hard TPM-size limit — retrying won't help
            err_body = str(e)
            if "request too large" in err_body.lower() or (
                hasattr(e, "body") and isinstance(e.body, dict)
                and e.body.get("error", {}).get("type") == "tokens"
            ):
                raise

            if attempt == max_retries:
                raise

            # Parse retry-after header if present, else exponential backoff
            retry_after = None
            if hasattr(e, "response") and e.response is not None:
                retry_after_str = e.response.headers.get("retry-after")
                if retry_after_str:
                    try:
                        retry_after = int(retry_after_str)
                    except ValueError:
                        pass

            wait = retry_after if retry_after else (2 ** attempt) * 15  # 15s, 30s, 60s, 120s
            print(f"\n  Rate limited. Retrying in {wait}s (attempt {attempt + 1}/{max_retries})...",
                  flush=True)
            time.sleep(wait)

        except Exception:
            # Re-raise anything else immediately — don't retry unknown errors
            raise

    raise RuntimeError("Unreachable")


def run_audit_openai(client: "openai_sdk.OpenAI", context: str, focus: str, model: str, max_tokens: int) -> str:
    """Run audit via OpenAI (streaming)."""
    prompt = AUDIT_PROMPT_TEMPLATE.format(focus=focus, context=context)
    print(f"  Sending to OpenAI ({model}, streaming)...", flush=True)
    return _openai_create(client, model, max_tokens, SYSTEM_PROMPT, prompt)


def run_deep_audit_openai(client: "openai_sdk.OpenAI", previous_findings: str, model: str, max_tokens: int) -> str:
    """Second-pass adversarial audit via OpenAI."""
    prompt = DEEP_AUDIT_PROMPT.format(previous_findings=previous_findings[:8000])
    print("  [--deep] Running second-pass adversarial audit (OpenAI)...", flush=True)
    return _openai_create(client, model, max_tokens, SYSTEM_PROMPT, prompt)


# ─────────────────────────────────────────────
# Provider dispatcher
# ─────────────────────────────────────────────

def run_audit(provider: str, client: object, context: str, focus: str, model: str, max_tokens: int) -> str:
    if provider == "anthropic":
        return run_audit_anthropic(client, context, focus, model, max_tokens)  # type: ignore[arg-type]
    return run_audit_openai(client, context, focus, model, max_tokens)  # type: ignore[arg-type]


def run_deep_audit(provider: str, client: object, previous_findings: str, model: str, max_tokens: int) -> str:
    if provider == "anthropic":
        return run_deep_audit_anthropic(client, previous_findings, model, max_tokens)  # type: ignore[arg-type]
    return run_deep_audit_openai(client, previous_findings, model, max_tokens)  # type: ignore[arg-type]


# ─────────────────────────────────────────────
# Batch audit engine
# ─────────────────────────────────────────────

def _run_single_batch(
    provider: str,
    client: object,
    context: str,
    focus: str,
    batch_num: int,
    batch_total: int,
    model: str,
    max_tokens: int,
) -> str:
    """Audit one batch context window, returns the raw findings text."""
    prompt = BATCH_PROMPT_TEMPLATE.format(
        focus=focus,
        batch_num=batch_num,
        batch_total=batch_total,
        context=context,
    )
    if provider == "anthropic":
        assert anthropic is not None
        with client.messages.stream(  # type: ignore[union-attr]
            model=model,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            parts: list[str] = []
            for event in stream:
                if (
                    event.type == "content_block_delta"
                    and hasattr(event.delta, "type")
                    and event.delta.type == "text_delta"
                ):
                    parts.append(event.delta.text)
                    print(".", end="", flush=True)
            stream.get_final_message()
        print()
        return "".join(parts)
    else:
        return _openai_create(client, model, max_tokens, SYSTEM_PROMPT, prompt)  # type: ignore[arg-type]


def _run_synthesis(
    provider: str,
    client: object,
    all_findings: str,
    batch_total: int,
    model: str,
    max_tokens: int,
) -> str:
    """Merge/deduplicate batch findings into a single executive report."""
    prompt = SYNTHESIS_PROMPT.format(
        batch_total=batch_total,
        all_findings=all_findings[:120_000],  # cap synthesis input
    )
    if provider == "anthropic":
        assert anthropic is not None
        with client.messages.stream(  # type: ignore[union-attr]
            model=model,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            parts: list[str] = []
            for event in stream:
                if (
                    event.type == "content_block_delta"
                    and hasattr(event.delta, "type")
                    and event.delta.type == "text_delta"
                ):
                    parts.append(event.delta.text)
                    print(".", end="", flush=True)
            stream.get_final_message()
        print()
        return "".join(parts)
    else:
        return _openai_create(client, model, max_tokens, SYSTEM_PROMPT, prompt)  # type: ignore[arg-type]


def run_batch_audit(
    provider: str,
    client: object,
    batches: list[tuple[str, list[str]]],
    focus: str,
    model: str,
    max_tokens: int,
) -> tuple[str, str, list[str]]:
    """
    Audit every batch, then synthesise.
    Returns (synthesis_text, raw_batch_findings, all_included_files).
    """
    import time

    batch_total = len(batches)
    all_included: list[str] = []
    batch_results: list[str] = []

    for i, (context, names) in enumerate(batches, start=1):
        approx_tokens = len(context) // 4
        print(
            f"\n  Batch {i}/{batch_total} — {len(names)} files "
            f"({len(context):,} chars, ~{approx_tokens:,} tokens)",
            flush=True,
        )
        print(f"  Sending to AI...", flush=True)
        result = _run_single_batch(
            provider, client, context, focus, i, batch_total, model, max_tokens
        )
        batch_results.append(result)
        all_included.extend(names)

        # Brief pause between batches to avoid hitting TPM limits
        if i < batch_total:
            time.sleep(3)

    # Synthesis pass
    print(f"\n  Synthesising {batch_total} batches...", flush=True)
    all_findings_text = "\n\n---\n\n".join(batch_results)
    synthesis = _run_synthesis(
        provider, client, all_findings_text, batch_total, model, max_tokens
    )

    return synthesis, all_findings_text, all_included


# ─────────────────────────────────────────────
# Severity parsing
# ─────────────────────────────────────────────

def parse_severity_counts(audit_text: str) -> dict[str, int]:
    """Extract severity counts from the summary table in the audit text."""
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for severity in counts:
        # Match table rows like: | CRITICAL | 2 |
        pattern = rf"\|\s*{severity}\s*\|\s*(\d+)\s*\|"
        m = re.search(pattern, audit_text, re.IGNORECASE)
        if m:
            counts[severity] = int(m.group(1))
        else:
            # Fallback: count headings like ### [CRITICAL]
            heading_count = len(re.findall(rf"###\s*\[{severity}\]", audit_text, re.IGNORECASE))
            counts[severity] = heading_count
    return counts


# ─────────────────────────────────────────────
# Output formatters
# ─────────────────────────────────────────────

def format_console(audit_text: str, counts: dict[str, int], included_files: list[str], elapsed: float) -> str:
    """Format a concise console summary."""
    lines = [
        "",
        "╔══════════════════════════════════════════════════════════╗",
        "║          🔐 MoodBloom Security Audit Report              ║",
        "╚══════════════════════════════════════════════════════════╝",
        "",
        f"  Files scanned : {len(included_files)}",
        f"  Duration      : {elapsed:.1f}s",
        "",
        "  Severity Breakdown:",
    ]
    severity_icons = {
        "CRITICAL": "🔴",
        "HIGH":     "🟠",
        "MEDIUM":   "🟡",
        "LOW":      "🔵",
        "INFO":     "⚪",
    }
    for sev, count in counts.items():
        if count > 0:
            lines.append(f"    {severity_icons[sev]} {sev}: {count}")
    lines.append("")

    # Extract and display top risks section
    top_risks_match = re.search(
        r"## Top 5 Critical Risks\n(.*?)(?=\n## )", audit_text, re.DOTALL
    )
    if top_risks_match:
        lines.append("  Top Risks:")
        for line in top_risks_match.group(1).strip().splitlines():
            if line.strip():
                lines.append(f"    {line}")
        lines.append("")

    lines.append("  Full report saved to docs/security_reports/")
    lines.append("")
    return "\n".join(lines)


def format_json(audit_text: str, counts: dict[str, int], included_files: list[str],
                focus: str, timestamp: str, report_path: str) -> str:
    """Format audit results as JSON for CI pipelines."""
    # Extract individual findings
    findings = []
    pattern = r"### \[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\] (.+?)\n"
    for m in re.finditer(pattern, audit_text):
        findings.append({"severity": m.group(1), "title": m.group(2).strip()})

    result = {
        "audit_timestamp": timestamp,
        "focus": focus,
        "files_scanned": len(included_files),
        "summary": counts,
        "findings": findings,
        "report_path": report_path,
        "pass": counts["CRITICAL"] == 0,
    }
    return json.dumps(result, indent=2)


def build_markdown_report(
    audit_text: str,
    deep_text: str | None,
    counts: dict[str, int],
    included_files: list[str],
    focus: str,
    timestamp: str,
    elapsed: float,
    provider: str,
    model: str,
    batch_mode: bool = False,
    raw_batch_text: str | None = None,
) -> str:
    """Assemble the full markdown report document."""
    mode_label = "BATCH" if batch_mode else "SINGLE"
    lines = [
        f"# MoodBloom Security Audit",
        f"",
        f"**Date:** {timestamp}  ",
        f"**Focus:** {focus.upper()}  ",
        f"**Mode:** {mode_label}  ",
        f"**Files analysed:** {len(included_files)}  ",
        f"**Duration:** {elapsed:.1f}s  ",
        f"**Provider:** {provider}  ",
        f"**Model:** {model}",
        f"",
        "---",
        "",
        audit_text.strip(),
    ]

    if deep_text:
        lines += [
            "",
            "---",
            "",
            "## Second-Pass Adversarial Findings (--deep)",
            "",
            deep_text.strip(),
        ]

    if batch_mode and raw_batch_text:
        lines += [
            "",
            "---",
            "",
            "## Raw Batch Findings (pre-synthesis)",
            "",
            "<details><summary>Expand raw per-batch output</summary>",
            "",
            raw_batch_text.strip(),
            "",
            "</details>",
        ]

    lines += [
        "",
        "---",
        "",
        "## Files Analysed",
        "",
    ]
    for f in included_files:
        lines.append(f"- `{f}`")

    lines += [
        "",
        "---",
        f"*Generated by scripts/security_audit.py — MoodBloom v0.6.x*",
    ]
    return "\n".join(lines)


# ─────────────────────────────────────────────
# Report persistence
# ─────────────────────────────────────────────

def save_report(content: str, report_dir: Path, timestamp_slug: str) -> Path:
    """Write the markdown report, never overwriting an existing file."""
    report_dir.mkdir(parents=True, exist_ok=True)
    base_name = f"audit_{timestamp_slug}.md"
    out_path = report_dir / base_name

    # Prevent overwrite
    counter = 1
    while out_path.exists():
        out_path = report_dir / f"audit_{timestamp_slug}_{counter}.md"
        counter += 1

    out_path.write_text(content, encoding="utf-8")
    return out_path


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="MoodBloom Security Audit — AI-powered codebase security analysis",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 scripts/security_audit.py
  python3 scripts/security_audit.py --focus crypto
  python3 scripts/security_audit.py --focus full --output markdown
  python3 scripts/security_audit.py --focus full --deep
  python3 scripts/security_audit.py --focus full --output json
  python3 scripts/security_audit.py --provider openai
  python3 scripts/security_audit.py --provider openai --model o3
  python3 scripts/security_audit.py --provider openai --model gpt-4o --focus crypto
        """,
    )
    parser.add_argument(
        "--path",
        default=".",
        help="Path to codebase root (default: current directory)",
    )
    parser.add_argument(
        "--focus",
        choices=["crypto", "network", "full"],
        default="full",
        help="Audit focus area (default: full)",
    )
    parser.add_argument(
        "--output",
        choices=["console", "markdown", "json"],
        default="console",
        help="Output format (default: console). Markdown is always saved.",
    )
    parser.add_argument(
        "--deep",
        action="store_true",
        help="Enable second-pass adversarial analysis",
    )
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai"],
        default="anthropic",
        help="AI provider to use (default: anthropic)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help=(
            "Model override. Anthropic default: claude-opus-4-6. "
            "OpenAI default: gpt-4o (use 'o3' for deeper reasoning)"
        ),
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help=(
            "Batch mode: split all files into chunks and audit each independently, "
            "then synthesise into one report. Covers the full codebase regardless of "
            "token limits."
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help=(
            "Max chars per batch chunk (default: same as single-mode context limit). "
            "Lower this if you hit TPM limits."
        ),
    )
    args = parser.parse_args()

    # ── Resolve model + check SDK availability ─────────────────────
    provider = args.provider
    if provider == "anthropic":
        if anthropic is None:
            print("ERROR: 'anthropic' package not installed. Run: pip install anthropic")
            sys.exit(1)
        model = args.model or ANTHROPIC_MODEL
        max_tokens = ANTHROPIC_MAX_TOKENS
    else:  # openai
        if openai_sdk is None:
            print("ERROR: 'openai' package not installed. Run: pip install openai")
            sys.exit(1)
        model = args.model or OPENAI_MODEL
        max_tokens = OPENAI_MAX_TOKENS

    root = Path(args.path).resolve()
    if not root.is_dir():
        print(f"ERROR: Path '{root}' is not a directory.")
        sys.exit(1)

    report_dir = root / SECURITY_REPORT_DIR
    timestamp = datetime.now()
    timestamp_iso = timestamp.strftime("%Y-%m-%dT%H:%M:%S")
    timestamp_slug = timestamp.strftime("%Y%m%d_%H%M%S")

    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║          MoodBloom Security Audit                        ║")
    print("╚══════════════════════════════════════════════════════════╝")
    batch_mode = args.batch
    max_ctx = ANTHROPIC_MAX_CONTEXT_CHARS if provider == "anthropic" else OPENAI_MAX_CONTEXT_CHARS
    batch_size = args.batch_size or max_ctx

    print(f"  Root     : {root}")
    print(f"  Focus    : {args.focus.upper()}")
    print(f"  Provider : {provider}  ({model})")
    print(f"  Mode     : {'BATCH (chunk size: ' + str(batch_size) + ' chars)' if batch_mode else 'SINGLE'}")
    print(f"  Deep     : {'yes (single mode only)' if args.deep and not batch_mode else 'yes' if args.deep else 'no'}")
    print(f"  Output   : {args.output}")
    print()

    # ── Step 1: Scan codebase ──────────────────────────────────────
    print("  [1/4] Scanning codebase...", flush=True)
    t_start = datetime.now()

    files = scan_codebase(root, args.focus)
    if not files:
        print("  WARNING: No relevant files found for the selected focus.")
        print("  Try --focus full or check --path.")
        sys.exit(1)

    # ── Step 2: Build client ───────────────────────────────────────
    client: object
    if provider == "anthropic":
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print()
            print("  ERROR: ANTHROPIC_API_KEY environment variable not set.")
            print("  Export it: export ANTHROPIC_API_KEY=sk-ant-...")
            sys.exit(1)
        client = anthropic.Anthropic(api_key=api_key)
    else:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print()
            print("  ERROR: OPENAI_API_KEY environment variable not set.")
            print("  Export it: export OPENAI_API_KEY=sk-...")
            sys.exit(1)
        client = openai_sdk.OpenAI(api_key=api_key, timeout=300.0, max_retries=0)

    # ── Step 3: Run audit ──────────────────────────────────────────
    audit_text: str
    deep_text: str | None = None
    raw_batch_text: str | None = None
    included_files: list[str]

    if batch_mode:
        batches = split_into_batches(files, batch_size)
        print(f"        Found {len(files)} relevant files → {len(batches)} batches of ≤{batch_size:,} chars")
        print()
        print(f"  [2/4] Running batch audit ({len(batches)} batches, {provider} / {model})...", flush=True)
        try:
            audit_text, raw_batch_text, included_files = run_batch_audit(
                provider, client, batches, args.focus, model, max_tokens
            )
        except Exception as e:
            _handle_api_error(provider, e)
        print("  [3/4] Batch synthesis complete (--deep not available in batch mode)")

    else:
        context, included_files = build_context_bundle(files, max_ctx)
        approx_tokens = len(context) // 4
        print(f"        Found {len(files)} relevant files, packed {len(included_files)} into context")
        print(f"        Context size: {len(context):,} chars (~{approx_tokens:,} tokens)")
        print()
        print(f"  [2/4] Running primary security audit ({provider} / {model})...", flush=True)
        try:
            audit_text = run_audit(provider, client, context, args.focus, model, max_tokens)
        except Exception as e:
            _handle_api_error(provider, e)

        if args.deep:
            print()
            print("  [3/4] Running deep adversarial pass...", flush=True)
            try:
                deep_text = run_deep_audit(provider, client, audit_text, model, max_tokens)
            except Exception as e:
                print(f"\n  WARNING: Deep audit failed: {e}")
        else:
            print("  [3/4] Skipping deep pass (use --deep to enable)")

    elapsed = (datetime.now() - t_start).total_seconds()

    # ── Step 4: Build outputs ──────────────────────────────────────
    print()
    print("  [4/4] Generating outputs...", flush=True)

    counts = parse_severity_counts(audit_text)
    if deep_text:
        deep_counts = parse_severity_counts(deep_text)
        for k in counts:
            counts[k] += deep_counts.get(k, 0)

    # Always save markdown report
    md_report = build_markdown_report(
        audit_text, deep_text, counts, included_files,
        args.focus, timestamp_iso, elapsed, provider, model,
        batch_mode=batch_mode, raw_batch_text=raw_batch_text,
    )
    report_path = save_report(md_report, report_dir, timestamp_slug)
    print(f"        Markdown report saved: {report_path.relative_to(root)}")

    # ── Render requested output ────────────────────────────────────
    if args.output == "console":
        print(format_console(audit_text, counts, included_files, elapsed))

    elif args.output == "markdown":
        print()
        print(md_report)

    elif args.output == "json":
        json_out = format_json(
            audit_text, counts, included_files,
            args.focus, timestamp_iso, str(report_path.relative_to(root))
        )
        print()
        print(json_out)

        # CI exit code: non-zero if CRITICAL findings exist
        if counts["CRITICAL"] > 0:
            print(
                f"\n  ❌ CI FAIL: {counts['CRITICAL']} CRITICAL finding(s) detected.",
                file=sys.stderr
            )
            sys.exit(1)
        else:
            print("\n  ✅ CI PASS: No CRITICAL findings.", file=sys.stderr)


def _handle_api_error(provider: str, exc: Exception) -> None:
    """Print a detailed error message and exit."""
    exc_type = type(exc).__name__
    msg = str(exc)

    print(f"\n  ERROR [{exc_type}]: {msg}", flush=True)

    # Friendly hints for common cases
    if provider == "anthropic" and anthropic is not None:
        if isinstance(exc, anthropic.AuthenticationError):
            print("  Hint: Check your ANTHROPIC_API_KEY.")
        elif isinstance(exc, anthropic.RateLimitError):
            print("  Hint: Rate limited — wait and retry, or use --provider openai.")
        elif "credit" in msg.lower() or "balance" in msg.lower():
            print("  Hint: Insufficient credits — top up at console.anthropic.com.")
    elif provider == "openai" and openai_sdk is not None:
        if isinstance(exc, openai_sdk.AuthenticationError):
            print("  Hint: Check your OPENAI_API_KEY.")
        elif isinstance(exc, openai_sdk.RateLimitError):
            err_body = str(exc)
            if "request too large" in err_body.lower() or "tokens per min" in err_body.lower():
                limit_match = re.search(r"Limit (\d+)", err_body)
                needed_match = re.search(r"Requested (\d+)", err_body)
                limit = limit_match.group(1) if limit_match else "?"
                needed = needed_match.group(1) if needed_match else "?"
                print(f"  Hint: Your account TPM limit ({limit} tokens/min) is smaller than")
                print(f"        this request ({needed} tokens). The script already targets")
                print(f"        {OPENAI_MAX_CONTEXT_CHARS:,} chars for OpenAI — this means your")
                print(f"        tier limit is even lower than expected.")
                print(f"  Options:")
                print(f"    1. Upgrade OpenAI tier: platform.openai.com/account/rate-limits")
                print(f"    2. Use --focus crypto or --focus network (smaller context)")
                print(f"    3. Use --provider anthropic once you have credits")
            else:
                print("  Hint: Transient rate limit — the script retries automatically.")
        elif isinstance(exc, openai_sdk.BadRequestError) and "context" in msg.lower():
            print("  Hint: Context too large. This shouldn't happen — please report.")
        elif "timeout" in exc_type.lower() or "timeout" in msg.lower():
            print("  Hint: Connection timed out. Check your network or try again.")
        elif "connect" in exc_type.lower():
            print("  Hint: Could not connect to api.openai.com. Check your network.")

    sys.exit(1)


if __name__ == "__main__":
    main()
