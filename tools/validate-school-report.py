"""Validate the generated management DOCX package and its Markdown coverage.

Uses only Python's standard library. This checks structure and source text,
not Microsoft Word rendering, pagination, fonts, or physical printer output.
"""
import posixpath
import re
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "school-review-report.md"
REPORT = ROOT / "PCDAV_school_ERP_school_review_report.docx"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def clean(value):
    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    return " ".join(value.split())


def source_fragments():
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line in ("---", "***"):
            continue
        if line.startswith("|"):
            cells = line.strip("|").split("|")
            if all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells):
                continue
            yield from (clean(cell) for cell in cells if cell.strip())
        else:
            line = re.sub(r"^(?:#{1,4}\s+|>\s+|[-*+]\s+|\d+[.)]\s+)", "", line)
            yield clean(line)


def main():
    with ZipFile(REPORT) as package:
        assert package.testzip() is None, "Corrupt ZIP member"
        names = set(package.namelist())
        required = {"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml"}
        assert required <= names, f"Missing required package parts: {required - names}"
        for name in sorted(names):
            if name.endswith((".xml", ".rels")):
                root = ET.fromstring(package.read(name))
                if name.endswith(".rels"):
                    base = posixpath.dirname(posixpath.dirname(name))
                    for relation in root:
                        if relation.get("TargetMode") == "External":
                            continue
                        target = unquote(relation.attrib["Target"])
                        resolved = posixpath.normpath(posixpath.join(base, target)).lstrip("/")
                        assert resolved in names, f"Missing relationship target: {name} -> {resolved}"
        document = ET.fromstring(package.read("word/document.xml"))
        text = " ".join("".join(node.itertext()) for node in document.iter(f"{W}t"))
        normalized = clean(text)
        fragments = list(source_fragments())
        missing = [fragment for fragment in fragments if fragment not in normalized]
        assert not missing, f"Source text missing from DOCX: {missing[:5]}"
        assert document.find(f"{W}body") is not None, "Document has no body"
    print(f"PASS: {REPORT.name}: {len(names)} ZIP parts, valid XML/relationships, {len(fragments)} source fragments, {len(text)} text characters")
    print("Not checked: Word/LibreOffice visual rendering or physical print layout.")


if __name__ == "__main__":
    main()
