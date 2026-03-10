#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


SOURCE_FILE = Path("BATCHOUT")
OUTPUT_FILE = Path("relationships.json")

PAGE_START_RE = re.compile(
    r"1LJOB,JOB=\*,LIST=NODD\s+JOB=\*\s+LIST=NODD\s+DATE=\d{2}\.\d{3}\s+PAGE\s+\d{4}"
)
JOB_NAME_RE = re.compile(r"DATE/TIME\s+([\$#@A-Z0-9]+)\s+\d{3}\s+")
SECTION_RE = re.compile(r"-{10,}\s*([A-Z0-9 /&]+?)\s*-{10,}")
ENTRY_RE = re.compile(r"JOB=([\$#@A-Z0-9]+)\s+SCHID=(\d{3})")

RELATIONSHIP_SECTIONS = {
    "TRIGGERED JOBS": "triggeredJobs",
    "SUCCESSOR JOBS": "successorJobs",
    "TRIGGERED BY JOBS/DATASETS": "triggeredBy",
    "REQUIREMENTS": "requirements",
}

SECTION_LABELS = {
    "triggeredJobs": "Triggered Jobs",
    "successorJobs": "Successor Jobs",
    "triggeredBy": "Triggered By",
    "requirements": "Requirements",
}


def split_blocks(text: str) -> list[str]:
    starts = [match.start() for match in PAGE_START_RE.finditer(text)]
    blocks: list[str] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(text)
        blocks.append(text[start:end])
    return blocks


def dedupe_entries(entries: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    unique_entries: list[dict[str, str]] = []
    for entry in entries:
        key = (entry["job"], entry["schid"])
        if key in seen:
            continue
        seen.add(key)
        unique_entries.append(entry)
    return unique_entries


def parse_block(block: str) -> tuple[str | None, dict[str, list[dict[str, str]]]]:
    job_match = JOB_NAME_RE.search(block)
    if not job_match:
        return None, {}

    relationships: dict[str, list[dict[str, str]]] = {
        value: [] for value in RELATIONSHIP_SECTIONS.values()
    }
    sections = list(SECTION_RE.finditer(block))
    for index, section_match in enumerate(sections):
        title = section_match.group(1).strip()
        relation_key = RELATIONSHIP_SECTIONS.get(title)
        if relation_key is None:
            continue

        body_start = section_match.end()
        body_end = sections[index + 1].start() if index + 1 < len(sections) else len(block)
        body = block[body_start:body_end]
        relationships[relation_key].extend(
            {"job": job_name, "schid": schid}
            for job_name, schid in ENTRY_RE.findall(body)
        )

    normalized = {key: dedupe_entries(value) for key, value in relationships.items()}
    return job_match.group(1), normalized


def build_graph(raw_text: str) -> dict[str, object]:
    jobs: dict[str, dict[str, object]] = {}
    parsed_pages = 0
    skipped_pages = 0
    parsed_job_names: set[str] = set()

    for block in split_blocks(raw_text):
        job_name, relationships = parse_block(block)
        if job_name is None:
            skipped_pages += 1
            continue

        parsed_pages += 1
        parsed_job_names.add(job_name)
        jobs[job_name] = {
            "name": job_name,
            "relationships": relationships,
        }

    referenced_jobs: set[str] = set()
    incoming = Counter()
    outgoing = Counter()

    for job_name, payload in jobs.items():
        relationships = payload["relationships"]
        for relation_key, entries in relationships.items():
            for entry in entries:
                related_job = entry["job"]
                referenced_jobs.add(related_job)
                if relation_key == "triggeredBy":
                    incoming[job_name] += 1
                    outgoing[related_job] += 1
                else:
                    outgoing[job_name] += 1
                    incoming[related_job] += 1

    all_jobs = set(jobs) | referenced_jobs
    for job_name in sorted(all_jobs):
        if job_name not in jobs:
            jobs[job_name] = {
                "name": job_name,
                "relationships": {
                    key: [] for key in RELATIONSHIP_SECTIONS.values()
                },
            }

        relationships = jobs[job_name]["relationships"]
        explicit_incoming = len(relationships["triggeredBy"])
        explicit_outgoing = (
            len(relationships["triggeredJobs"])
            + len(relationships["successorJobs"])
            + len(relationships["requirements"])
        )
        if job_name in parsed_job_names:
            incoming_count = explicit_incoming
            outgoing_count = explicit_outgoing
        else:
            incoming_count = incoming[job_name]
            outgoing_count = outgoing[job_name]

        jobs[job_name]["stats"] = {
            "incoming": incoming_count,
            "outgoing": outgoing_count,
            "total": incoming_count + outgoing_count,
        }

    stats = {
        "jobsInSource": parsed_pages,
        "jobsInGraph": len(jobs),
        "jobsReferencedOnly": len(all_jobs - parsed_job_names),
        "pagesSkipped": skipped_pages,
        "relationshipCounts": {
            SECTION_LABELS[key]: sum(
                len(payload["relationships"][key]) for payload in jobs.values()
            )
            for key in RELATIONSHIP_SECTIONS.values()
        },
    }

    return {
        "generatedFrom": SOURCE_FILE.name,
        "sectionLabels": SECTION_LABELS,
        "stats": stats,
        "jobNames": sorted(jobs),
        "jobs": jobs,
    }


def main() -> None:
    raw_text = SOURCE_FILE.read_text(errors="ignore")
    data = build_graph(raw_text)
    OUTPUT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_FILE} with {data['stats']['jobsInGraph']} jobs.")


if __name__ == "__main__":
    main()
