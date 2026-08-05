"""Build compact browser lookup shards from the verified FreeDict release."""

from __future__ import annotations

import hashlib
import json
import shutil
import tarfile
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


VERSION = "2025.11.23"
ARCHIVE_NAME = f"freedict-eng-zho-{VERSION}.src.tar.xz"
ARCHIVE_URL = (
    "https://download.freedict.org/dictionaries/eng-zho/"
    f"{VERSION}/{ARCHIVE_NAME}"
)
EXPECTED_SHA512 = (
    "25aed0f1d7de68919aa9da1ba92d67f566ae4ea81660f42071c81fc21e56d4b"
    "210d61df379315678648c45ca7e52c4a0ba2eec009fbaab7c72e7472489e1fc4c"
)
TEI_NAMESPACE = {"tei": "http://www.tei-c.org/ns/1.0"}
MAX_TRANSLATIONS_PER_WORD = 8
MAX_GLOSS_LENGTH = 240
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIRECTORY = PROJECT_ROOT / "public" / "data" / "freedict"
LICENSE_DIRECTORY = PROJECT_ROOT / "public" / "licenses"


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_headword(value: str) -> str:
    return normalize_text(value).casefold()


def shard_name(headword: str) -> str:
    first = headword[0] if headword else ""
    return first if first in "abcdefghijklmnopqrstuvwxyz" else "_"


def download_verified_archive(destination: Path) -> None:
    urllib.request.urlretrieve(ARCHIVE_URL, destination)
    digest = hashlib.sha512(destination.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA512:
        raise RuntimeError("FreeDict archive checksum did not match.")


def parse_dictionary(tei_path: Path) -> dict[str, list[tuple[str, str]]]:
    entries: dict[str, list[tuple[str, str]]] = defaultdict(list)

    for _, element in ET.iterparse(tei_path, events=("end",)):
        if element.tag != "{http://www.tei-c.org/ns/1.0}entry":
            continue

        headword = normalize_headword(
            element.findtext("./tei:form/tei:orth", "", TEI_NAMESPACE)
        )
        # The PDF interaction layer selects one token at a time, so phrase
        # headwords can never be requested by the extension.
        if not headword or any(character.isspace() for character in headword):
            element.clear()
            continue

        seen: set[tuple[str, str]] = set()
        for sense in element.findall("./tei:sense", TEI_NAMESPACE):
            translation = normalize_text(
                sense.findtext(
                    './tei:cit[@type="trans"]/tei:quote',
                    "",
                    TEI_NAMESPACE,
                )
            )
            if not translation:
                continue

            definition_element = sense.find(".//tei:def", TEI_NAMESPACE)
            definition = (
                normalize_text("".join(definition_element.itertext()))
                if definition_element is not None
                else headword
            )
            definition = definition[:MAX_GLOSS_LENGTH].rstrip()
            identity = (translation, definition)
            if identity in seen:
                continue

            entries[headword].append((definition, translation))
            seen.add(identity)
            if len(entries[headword]) >= MAX_TRANSLATIONS_PER_WORD:
                break

        element.clear()

    return dict(entries)


def write_shards(entries: dict[str, list[tuple[str, str]]]) -> None:
    if OUTPUT_DIRECTORY.exists():
        shutil.rmtree(OUTPUT_DIRECTORY)
    OUTPUT_DIRECTORY.mkdir(parents=True)

    # Tuples avoid repeating JSON field names for every translation.
    shards: dict[str, dict[str, list[tuple[str, str]]]] = defaultdict(dict)
    for headword, translations in sorted(entries.items()):
        shards[shard_name(headword)][headword] = translations

    for name, shard in sorted(shards.items()):
        output = OUTPUT_DIRECTORY / f"{name}.json"
        output.write_text(
            json.dumps(
                shard,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ),
            encoding="utf-8",
        )

    manifest = {
        "dictionary": "FreeDict English-Chinese",
        "entryCount": len(entries),
        "license": "CC BY-SA 3.0",
        "release": VERSION,
        "selection": "Single-token English headwords used by the PDF word picker",
        "shards": sorted(shards),
        "source": ARCHIVE_URL,
    }
    (OUTPUT_DIRECTORY / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="linguaread-freedict-") as temp:
        temp_directory = Path(temp)
        archive = temp_directory / ARCHIVE_NAME
        download_verified_archive(archive)

        with tarfile.open(archive) as source:
            members = source.getmembers()
            tei_member = next(
                member for member in members if member.name.endswith("eng-zho.tei")
            )
            license_member = next(
                member for member in members if member.name.endswith("/COPYING")
            )
            source.extract(tei_member, temp_directory, filter="data")
            source.extract(license_member, temp_directory, filter="data")

        entries = parse_dictionary(temp_directory / tei_member.name)
        write_shards(entries)

        LICENSE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            temp_directory / license_member.name,
            LICENSE_DIRECTORY / "FreeDict-eng-zho-COPYING.txt",
        )

    print(
        f"Generated {len(entries):,} FreeDict entries in "
        f"{OUTPUT_DIRECTORY.relative_to(PROJECT_ROOT)}."
    )


if __name__ == "__main__":
    main()
