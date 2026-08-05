"""Build compact browser lookup shards from a pinned ECDICT source."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import tempfile
import urllib.request
from collections import defaultdict
from pathlib import Path


SOURCE_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
CSV_URL = (
    "https://raw.githubusercontent.com/skywind3000/ECDICT/"
    f"{SOURCE_COMMIT}/ecdict.csv"
)
LICENSE_URL = (
    "https://raw.githubusercontent.com/skywind3000/ECDICT/"
    f"{SOURCE_COMMIT}/LICENSE"
)
EXPECTED_SHA256 = (
    "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
)
MAX_TRANSLATIONS_PER_WORD = 8
MAX_GLOSS_LENGTH = 160
MAX_TRANSLATION_LENGTH = 40
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIRECTORY = PROJECT_ROOT / "public" / "data" / "ecdict"
LICENSE_DIRECTORY = PROJECT_ROOT / "public" / "licenses"
PART_OF_SPEECH_PREFIX = re.compile(
    r"^(?:a|adj|adv|art|aux|conj|int|n|num|prep|pron|v|vi|vt)\.\s*",
    re.IGNORECASE,
)
TRANSLATION_SEPARATOR = re.compile(r"[,，;；]")


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_headword(value: str) -> str:
    return normalize_text(value).casefold()


def shard_name(headword: str) -> str:
    if len(headword) >= 2 and headword[:2].isalpha():
        return headword[:2]
    return "_"


def is_ranked(row: dict[str, str]) -> bool:
    return any(
        row[field].strip() not in {"", "0"}
        for field in ("bnc", "collins", "frq", "oxford")
    ) or bool(row["tag"].strip())


def download_verified_csv(destination: Path) -> None:
    urllib.request.urlretrieve(CSV_URL, destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError("ECDICT CSV checksum did not match.")


def clean_translation_values(value: str) -> list[str]:
    results: list[str] = []
    for line in value.replace("\\n", "\n").splitlines():
        line = normalize_text(line)
        if not line or line.startswith("["):
            continue
        line = PART_OF_SPEECH_PREFIX.sub("", line)
        for candidate in TRANSLATION_SEPARATOR.split(line):
            candidate = candidate.strip(" .")
            if (
                candidate
                and len(candidate) <= MAX_TRANSLATION_LENGTH
                and candidate not in results
            ):
                results.append(candidate)
                if len(results) >= MAX_TRANSLATIONS_PER_WORD:
                    return results
    return results


def parse_dictionary(csv_path: Path) -> dict[str, tuple[str, list[str]]]:
    entries: dict[str, tuple[str, list[str]]] = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            headword = normalize_headword(row["word"])
            # The PDF interaction layer selects one token at a time, so phrase
            # headwords can never be requested by the extension.
            if (
                not headword
                or any(character.isspace() for character in headword)
                or not is_ranked(row)
            ):
                continue

            values = clean_translation_values(row["translation"])
            if not values:
                continue

            gloss = normalize_text(row["definition"].replace("\\n", "\n")) or headword
            gloss = gloss[:MAX_GLOSS_LENGTH].rstrip()
            entries[headword] = (gloss, values)

    return entries


def write_shards(entries: dict[str, tuple[str, list[str]]]) -> None:
    if OUTPUT_DIRECTORY.exists():
        shutil.rmtree(OUTPUT_DIRECTORY)
    OUTPUT_DIRECTORY.mkdir(parents=True)

    # Store one gloss beside a value list so it is not repeated for every sense.
    shards: dict[str, dict[str, tuple[str, list[str]]]] = defaultdict(dict)
    for headword, translations in sorted(entries.items()):
        shards[shard_name(headword)][headword] = translations

    for name, shard in sorted(shards.items()):
        (OUTPUT_DIRECTORY / f"{name}.json").write_text(
            json.dumps(
                shard,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ),
            encoding="utf-8",
        )

    manifest = {
        "dictionary": "ECDICT English-Chinese",
        "entryCount": len(entries),
        "license": "MIT",
        "selection": (
            "Translated entries with a BNC or contemporary frequency rank, "
            "Oxford marker, Collins marker, or exam tag; single-token "
            "headwords used by the PDF word picker"
        ),
        "sourceCommit": SOURCE_COMMIT,
        "source": CSV_URL,
        "sourceSha256": EXPECTED_SHA256,
        "shards": sorted(shards),
    }
    (OUTPUT_DIRECTORY / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def copy_license(destination: Path) -> None:
    urllib.request.urlretrieve(LICENSE_URL, destination)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        help="Use an already downloaded, checksum-matched ECDICT CSV.",
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    with tempfile.TemporaryDirectory(prefix="linguaread-ecdict-") as temp:
        temp_directory = Path(temp)
        csv_path = temp_directory / "ecdict.csv"
        if arguments.source:
            shutil.copyfile(arguments.source, csv_path)
            digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
            if digest != EXPECTED_SHA256:
                raise RuntimeError("Local ECDICT CSV checksum did not match.")
        else:
            download_verified_csv(csv_path)

        entries = parse_dictionary(csv_path)
        write_shards(entries)

        LICENSE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        copy_license(LICENSE_DIRECTORY / "ECDICT-LICENSE.txt")

    print(
        f"Generated {len(entries):,} ECDICT entries in "
        f"{OUTPUT_DIRECTORY.relative_to(PROJECT_ROOT)}."
    )


if __name__ == "__main__":
    main()
