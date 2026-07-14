"""
OpenMontage → GeneralAgent 适配层

将 GeneralAgent 传入的小说内容转换为 OpenMontage 的 pipeline 输入格式，
并管理异步渲染任务。
"""

from __future__ import annotations

import uuid
import time
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class RenderStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class RenderTask:
    """跟踪单个渲染任务的状态。"""
    task_id: str
    project_title: str
    pipeline: str
    status: RenderStatus = RenderStatus.QUEUED
    progress: float = 0.0
    output_path: Optional[str] = None
    error: Optional[str] = None
    cost_usd: float = 0.0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


# 内存任务存储（单进程够用；持久化交给 GeneralAgent 侧的数据库）
_tasks: dict[str, RenderTask] = {}
_lock = threading.Lock()


def novel_content_to_scene_plan(
    synopsis: str,
    characters: list[dict[str, Any]],
    chapter_text: str | None = None,
    world_notes: str | None = None,
    target_duration_sec: int = 60,
    visual_style: str = "cinematic",
) -> dict[str, Any]:
    """
    将小说内容转换为 OpenMontage 的 scene_plan 格式。

    这是一个结构化转换，真正的 AI 脚本生成由 GeneralAgent
    的 Prompt Registry 处理；这里只做格式对齐。
    """
    # 构建角色摘要
    character_descriptions = []
    for char in characters:
        desc = char.get("name", "Unknown")
        if char.get("persona"):
            desc += f" — {char['persona']}"
        if char.get("visualHint"):
            desc += f" (视觉: {char['visualHint']})"
        character_descriptions.append(desc)

    scene_plan = {
        "meta": {
            "source": "novel_adaptation",
            "target_duration_sec": target_duration_sec,
            "visual_style": visual_style,
        },
        "synopsis": synopsis,
        "characters": character_descriptions,
        "world_notes": world_notes or "",
        "source_text": chapter_text or "",
    }
    return scene_plan


def recommend_pipeline(
    content_type: str,
    has_narration: bool = True,
    visual_style: str = "cinematic",
) -> dict[str, Any]:
    """
    根据内容类型推荐 OpenMontage pipeline。

    Returns:
        推荐的 pipeline 名称、说明和预估成本。
    """
    recommendations = {
        "chapter_adaptation": {
            "pipeline": "animated-explainer",
            "reason": "章节改编适合用动画解说模式：AI 生成配图 + 旁白 + 字幕",
            "estimated_cost_usd": 0.15,
            "alternatives": ["cinematic", "animation"],
        },
        "trailer": {
            "pipeline": "cinematic",
            "reason": "预告片适合电影感剪辑：紧凑节奏 + 高冲击画面 + 氛围音乐",
            "estimated_cost_usd": 1.50,
            "alternatives": ["animation", "animated-explainer"],
        },
        "character_intro": {
            "pipeline": "animation",
            "reason": "角色介绍适合动画风格：角色展示 + 标题卡片 + 过渡动效",
            "estimated_cost_usd": 0.50,
            "alternatives": ["animated-explainer"],
        },
    }
    return recommendations.get(content_type, recommendations["chapter_adaptation"])


def create_render_task(
    project_title: str,
    pipeline: str,
    scene_plan: dict[str, Any],
) -> RenderTask:
    """
    创建并注册一个渲染任务。

    实际渲染通过 OpenMontage 的 tool_registry + Remotion/FFmpeg 执行。
    当前版本为同步占位，后续接入真实异步渲染。
    """
    task_id = str(uuid.uuid4())
    task = RenderTask(
        task_id=task_id,
        project_title=project_title,
        pipeline=pipeline,
    )
    with _lock:
        _tasks[task_id] = task
    return task


def get_render_task(task_id: str) -> RenderTask | None:
    """查询渲染任务状态。"""
    with _lock:
        return _tasks.get(task_id)


def list_render_tasks() -> list[RenderTask]:
    """列出所有渲染任务。"""
    with _lock:
        return sorted(_tasks.values(), key=lambda t: t.created_at, reverse=True)
