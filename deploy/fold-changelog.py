#!/usr/bin/env python3
"""Fold pending changelog.d fragments into CHANGELOG.md under a new version heading.

    deploy/fold-changelog.py VERSION FRAGMENT...

Anything already sitting under `## [Unreleased]` is folded in too, ahead of the fragments, so one release
never splits across two headings. Sections are merged across fragments in the order given, which
release.sh passes as merge order, and emitted in Keep a Changelog order. `## [Unreleased]` is left in
place and empty.
"""

import re
import sys

SECTIONS = ["Added", "Changed", "Fixed", "Removed"]


def sections_of(text):
    found = {}
    current = None
    for line in text.splitlines():
        heading = re.match(r"^### (\w+)\s*$", line)
        if heading:
            current = heading.group(1)
            found.setdefault(current, [])
        elif current is not None:
            found[current].append(line)
    return {name: "\n".join(lines).strip("\n") for name, lines in found.items()}


def main():
    version, fragments = sys.argv[1], sys.argv[2:]
    with open("CHANGELOG.md", encoding="utf-8") as handle:
        changelog = handle.read()

    match = re.search(r"^## \[Unreleased\]\n(.*?)(?=^## \[|\Z)", changelog, re.M | re.S)
    if not match:
        sys.exit("CHANGELOG.md has no '## [Unreleased]' heading")

    collected = {name: [] for name in SECTIONS}
    unknown = []
    for text in [match.group(1)] + [open(path, encoding="utf-8").read() for path in fragments]:
        for name, body in sections_of(text).items():
            if not body.strip():
                continue
            if name not in collected:
                unknown.append(name)
                continue
            collected[name].append(body)
    if unknown:
        sys.exit("Unknown changelog section(s): " + ", ".join(sorted(set(unknown))) + ". Use " + ", ".join(SECTIONS) + ".")

    body = "\n\n".join(f"### {name}\n" + "\n".join(collected[name]) for name in SECTIONS if collected[name])
    if not body:
        sys.exit("Nothing to fold: no fragment and nothing under [Unreleased]")

    released = f"## [Unreleased]\n\n## [{version}]\n\n{body}\n\n"
    changelog = changelog[: match.start()] + released + changelog[match.end():]
    with open("CHANGELOG.md", "w", encoding="utf-8") as handle:
        handle.write(changelog)


if __name__ == "__main__":
    main()
