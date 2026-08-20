#!/usr/bin/env python3
"""Assemble the PSA x Luna Sol case study into one self-contained page.

    python3 case-studies/build.py

Edit the parts in case-studies/src/ and re-run. The output is deliberately a
single file with no external assets except Google Fonts, so it can be hosted
anywhere or published as an Artifact unchanged.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, OUT = ROOT / "src", ROOT / "psa-luna-sol.html"

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The 14-Million-Card Recovery</title>
<meta name="description" content="How a record 14-million-card grading backlog became a recovery you can audit — every figure sourced, every derivation shown.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
"""

read = lambda name: (SRC / name).read_text(encoding="utf-8")
OUT.write_text(
    HEAD + read("style.css") + "\n</style>\n</head>\n<body>\n"
    + read("body.html") + "\n<script>\n" + read("engine.js") + "\n</script>\n</body>\n</html>\n",
    encoding="utf-8",
)
print(f"built {OUT.relative_to(ROOT.parent)} ({OUT.stat().st_size:,} bytes)")
