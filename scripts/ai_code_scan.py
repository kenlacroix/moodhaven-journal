#!/usr/bin/env python3
"""
AI Codebase Improvement Scanner
--------------------------------
Scans a codebase, batches representative files, sends them to OpenAI for
high‑level improvement suggestions, and writes Markdown feedback per folder.

Features
- OpenAI Python SDK >= 1.0 compatible
- Folder-level batching
- Deduplication of similar files
- Token-efficient trimming (first 500 + last 200 lines)
- Binary/media skipping
- Large-file skipping
- Resume support
- Progress indicators
- Summary report
"""

import os
import sys
import hashlib
from pathlib import Path
from time import sleep
from concurrent.futures import ThreadPoolExecutor

from openai import OpenAI

client = OpenAI()

# ================= CONFIG =================
OUTPUT_DIR = "docs/aifeedback"
MODEL = "gpt-4o-mini"

FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".rs", ".sql", ".css", ".scss", ".html"]

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "target", "__pycache__"
}

SKIP_FILE_EXTENSIONS = {
    ".png",".jpg",".jpeg",".gif",".ico",
    ".woff",".woff2",".ttf",".otf",
    ".sqlite",".db",".lock",
    ".exe",".dll",".so",".dylib",
    ".zip",".tar",".gz",".7z"
}

MAX_FILE_SIZE = 1_000_000
MAX_CHARS_PER_BATCH = 20000
THREAD_WORKERS = 4

PROMPT_TEMPLATE = """
Review the following code snippets from a software project.

Return ONLY a concise list of **high‑level improvement opportunities**:
- Security risks
- Maintainability improvements
- Performance concerns
- Testing gaps
- Structural or architectural improvements

Do not explain line-by-line. Provide concise bullet points.

Code:
```
{code}
```
"""

# ================= HELPERS =================

def is_source_file(filepath):
    name = os.path.basename(filepath)

    if not any(name.endswith(ext) for ext in FILE_EXTENSIONS):
        return False

    if any(name.endswith(ext) for ext in SKIP_FILE_EXTENSIONS):
        return False

    if os.path.getsize(filepath) > MAX_FILE_SIZE:
        return False

    return True


def hash_file(filepath, lines=20):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            head = "".join([f.readline() for _ in range(lines)])
        return hashlib.md5(head.encode()).hexdigest()
    except:
        return None


def trim_code(filepath):
    """
    Reduce tokens by sending first 500 + last 200 lines only.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        if len(lines) <= 700:
            return "".join(lines)

        head = "".join(lines[:500])
        tail = "".join(lines[-200:])

        return head + "\n\n// ... trimmed ...\n\n" + tail

    except:
        return ""


def collect_unique_files(folder):
    hash_map = {}

    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

        for file in files:
            path = os.path.join(root, file)

            if is_source_file(path):
                h = hash_file(path)

                if h:
                    hash_map.setdefault(h, []).append(path)

    return hash_map


def batch_files(unique_files):
    batches = []
    current_batch = []
    size = 0

    for files in unique_files.values():
        rep = files[0]
        code = trim_code(rep)

        block = f"\n// FILE: {rep}\n{code}\n"

        if size + len(block) > MAX_CHARS_PER_BATCH and current_batch:
            batches.append(current_batch)
            current_batch = []
            size = 0

        current_batch.append((block, files))
        size += len(block)

    if current_batch:
        batches.append(current_batch)

    return batches


def send_to_openai(code):
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a senior software engineer performing code review."},
                {"role": "user", "content": PROMPT_TEMPLATE.format(code=code)}
            ],
            max_tokens=800
        )

        return response.choices[0].message.content

    except Exception as e:
        return f"Error contacting OpenAI: {e}"


# ================= MAIN =================

def process_folder(folder, idx, total):

    output_file = os.path.join(OUTPUT_DIR, f"{folder.name}_improvements.md")

    if os.path.exists(output_file):
        print(f"[{idx}/{total}] Skipping {folder} (already scanned)")
        return ("skipped", folder.name, 0)

    print(f"[{idx}/{total}] Processing {folder}")

    unique_files = collect_unique_files(folder)

    if not unique_files:
        return ("skipped", folder.name, 0)

    batches = batch_files(unique_files)

    folder_feedback = ""

    for b_idx, batch in enumerate(batches, start=1):

        code = "\n".join(block for block, _ in batch)

        print(f"   -> batch {b_idx}/{len(batches)}")

        result = send_to_openai(code)

        files = [", ".join(f) for _, f in batch]

        folder_feedback += f"## Batch {b_idx}\n\nFiles:\n{files}\n\n"
        folder_feedback += result + "\n\n"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"# Improvements for {folder}\n\n")
        f.write(folder_feedback)

    return ("scanned", folder.name, len(batches))


def main():

    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set.")
        sys.exit(1)

    cwd = Path.cwd()

    print(f"Scanning directory: {cwd}")
    confirm = input("Continue? (y/n): ").lower()

    if confirm != "y":
        sys.exit(0)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    folders = [f for f in cwd.iterdir() if f.is_dir() and f.name not in SKIP_DIRS]

    scanned = []
    skipped = []
    batches_map = {}

    with ThreadPoolExecutor(max_workers=THREAD_WORKERS) as executor:

        futures = []

        for i, folder in enumerate(folders, start=1):
            futures.append(executor.submit(process_folder, folder, i, len(folders)))

        for f in futures:
            status, name, batches = f.result()

            if status == "scanned":
                scanned.append(name)
                batches_map[name] = batches
            else:
                skipped.append(name)

    summary = os.path.join(OUTPUT_DIR, "scan_summary.md")

    with open(summary, "w", encoding="utf-8") as f:

        f.write("# Scan Summary\n\n")

        f.write(f"Folders scanned: {len(scanned)}\n\n")
        f.write(f"Folders skipped: {len(skipped)}\n\n")

        f.write("## Scanned\n")
        for s in scanned:
            f.write(f"- {s}: {batches_map.get(s,0)} batches\n")

        f.write("\n## Skipped\n")
        for s in skipped:
            f.write(f"- {s}\n")

    print("\nScan complete.")
    print(f"Results written to {OUTPUT_DIR}")
    print(f"Summary: {summary}")


if __name__ == "__main__":
    main()
