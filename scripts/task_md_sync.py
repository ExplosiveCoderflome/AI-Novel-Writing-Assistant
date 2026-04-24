#!/usr/bin/env python3
"""Maintain the auto-managed Codex section in TASK.md."""

from __future__ import annotations

import argparse
import hashlib
import re
from datetime import datetime
from pathlib import Path


STATUS_LABELS = {
    "planned": "已计划",
    "in_progress": "开发中",
    "done": "已完成",
    "blocked": "已阻塞",
}

SECTION_TITLE = "## Codex 开发同步（自动维护）"
START_MARKER = "<!-- task-md-sync:start -->"
END_MARKER = "<!-- task-md-sync:end -->"


def build_slug(feature: str) -> str:
    digest = hashlib.sha1(feature.strip().encode("utf-8")).hexdigest()[:10]
    return f"task-{digest}"


def now_label() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def render_block(
    *,
    feature: str,
    slug: str,
    status: str,
    summary: str,
    plan_items: list[str],
    progress_note: str | None,
) -> str:
    timestamp = now_label()
    status_label = STATUS_LABELS[status]
    progress_lines = []
    if progress_note:
        progress_lines.append(f"- {timestamp} [{status_label}] {progress_note}")

    plan = "\n".join(f"- [ ] {item}" for item in plan_items) if plan_items else "- [ ] 待补充实施步骤"
    progress = "\n".join(progress_lines) if progress_lines else f"- {timestamp} [{status_label}] 已同步计划。"

    return f"""<!-- task-md-sync:item:{slug}:start -->
### {feature}
- 标识：`{slug}`
- 状态：{status_label}
- 最近更新：{timestamp}
- 概要：{summary}

计划清单：
{plan}

进度记录：
{progress}
<!-- task-md-sync:item:{slug}:end -->"""


def ensure_section(text: str) -> str:
    if START_MARKER in text and END_MARKER in text:
        return text

    section = f"""

{SECTION_TITLE}

本区块由 `$task-md-sync` 自动维护，用于同步开发计划与实现进度。
使用约定：

- 已完成项以第 `2` 节归档摘要为准，不再把本区块里的完成任务当作当前 backlog。
- 当前直接待做事项以第 `4` 节“当前未完成待做清单”为准；本区块主要保留开发流水记录与仍未完成的任务条目。

{START_MARKER}
{END_MARKER}
"""
    return text.rstrip() + section


def update_timestamp(text: str) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    return re.sub(r"^更新时间：\d{4}-\d{2}-\d{2}", f"更新时间：{today}", text, count=1, flags=re.MULTILINE)


def upsert_block(text: str, block: str, slug: str, replace_plan: bool) -> str:
    item_pattern = re.compile(
        rf"<!-- task-md-sync:item:{re.escape(slug)}:start -->.*?<!-- task-md-sync:item:{re.escape(slug)}:end -->",
        flags=re.DOTALL,
    )
    if item_pattern.search(text):
        if not replace_plan:
            raise SystemExit(f"Task block {slug} already exists. Use --replace-plan to update it.")
        return item_pattern.sub(block, text, count=1)

    end_index = text.index(END_MARKER)
    insertion = block.rstrip() + "\n"
    if not text[:end_index].endswith("\n"):
        insertion = "\n" + insertion
    return text[:end_index] + insertion + text[end_index:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="TASK.md")
    parser.add_argument("--feature", required=True)
    parser.add_argument("--status", choices=STATUS_LABELS.keys(), required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--replace-plan", action="store_true")
    parser.add_argument("--plan-item", action="append", default=[])
    parser.add_argument("--progress-note")
    args = parser.parse_args()

    task_path = Path(args.file)
    text = task_path.read_text(encoding="utf-8") if task_path.exists() else "# 项目任务计划\n"
    text = ensure_section(text)
    text = update_timestamp(text)

    slug = build_slug(args.feature)
    block = render_block(
        feature=args.feature,
        slug=slug,
        status=args.status,
        summary=args.summary,
        plan_items=args.plan_item,
        progress_note=args.progress_note,
    )
    text = upsert_block(text, block, slug, args.replace_plan)
    task_path.write_text(text, encoding="utf-8")
    print(f"synced {slug} in {task_path}")


if __name__ == "__main__":
    main()
