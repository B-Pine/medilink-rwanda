#!/usr/bin/env python3
"""Check that relative links in the repository's Markdown files resolve.

For every Markdown file (outside node_modules and build output), checks each relative link
target exists and, when the link has a #fragment pointing to a Markdown file, that a heading
with that GitHub-style anchor exists. External links (http, https, mailto) are not fetched.

Usage: python scripts/check-docs-links.py
"""
from __future__ import annotations

import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "node_modules", "dist", "build", ".venv", "venv", "coverage", "__pycache__"}
LINK = re.compile(r"!?\[(?:[^\]\[]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`]*`")
HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")


def markdown_files() -> list[pathlib.Path]:
    files = []
    for path in ROOT.rglob("*.md"):
        if not any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts):
            files.append(path)
    return sorted(files)


def strip_code(lines: list[str]) -> list[str]:
    """Blank out fenced code blocks and inline code so their contents are not parsed."""
    out, in_fence = [], False
    for line in lines:
        if FENCE.match(line):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else INLINE_CODE.sub("", line))
    return out


def slugify(text: str) -> str:
    """Approximate GitHub's heading anchors."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)  # keep link text
    text = text.replace("`", "").lower()
    kept = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in " -_" or cat[0] in ("L", "N") or cat == "Mn":
            kept.append(ch)
    return "".join(kept).replace(" ", "-")


def anchors(path: pathlib.Path, cache: dict[pathlib.Path, set[str]]) -> set[str]:
    if path not in cache:
        seen: dict[str, int] = {}
        result = set()
        in_fence = False
        for line in path.read_text(encoding="utf-8").splitlines():
            if FENCE.match(line):
                in_fence = not in_fence
                continue
            match = None if in_fence else HEADING.match(line)
            if match:
                slug = slugify(match.group(2))
                count = seen.get(slug, 0)
                seen[slug] = count + 1
                result.add(slug if count == 0 else f"{slug}-{count}")
        cache[path] = result
    return cache[path]


def main() -> int:
    cache: dict[pathlib.Path, set[str]] = {}
    errors, checked = [], 0
    for md in markdown_files():
        lines = strip_code(md.read_text(encoding="utf-8").splitlines())
        for number, line in enumerate(lines, 1):
            for match in LINK.finditer(line):
                target = match.group(1)
                if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I):
                    continue  # http:, https:, mailto:, …
                checked += 1
                path_part, _, fragment = target.partition("#")
                dest = md if not path_part else (md.parent / path_part).resolve()
                where = f"{md.relative_to(ROOT)}:{number}"
                if not dest.exists():
                    errors.append(f"{where}: missing target {target}")
                    continue
                if fragment and dest.suffix == ".md" and fragment not in anchors(dest, cache):
                    errors.append(f"{where}: missing anchor #{fragment} in {dest.relative_to(ROOT)}")
    for error in errors:
        print(error)
    print(f"checked {checked} relative links in {len(markdown_files())} files: {len(errors)} broken")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
