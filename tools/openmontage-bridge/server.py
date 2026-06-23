"""
OpenMontage Bridge Server

为 GeneralAgent 提供 REST API，暴露 OpenMontage 的视频制作能力。
启动方式: python tools/openmontage-bridge/server.py
默认端口: 8100

环境变量:
  OPENMONTAGE_ROOT  — 指向 OpenMontage 项目根目录（可选）。
                      如未设置，则 tool_registry 功能不可用，
                      但 Bridge 的适配和渲染任务管理仍正常工作。
  BRIDGE_PORT       — Bridge 监听端口，默认 8100。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# 如果设置了 OPENMONTAGE_ROOT，则将其加入 sys.path 以便导入 tools.*
# 如果未设置，则默认使用当前目录（即包含整个 OpenMontage 代码库的本地目录）
OPENMONTAGE_ROOT = os.environ.get("OPENMONTAGE_ROOT", str(Path(__file__).parent.resolve()))
if OPENMONTAGE_ROOT:
    _om_path = Path(OPENMONTAGE_ROOT).resolve()
    if str(_om_path) not in sys.path:
        sys.path.insert(0, str(_om_path))


from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Optional

from adapters import (
    novel_content_to_scene_plan,
    recommend_pipeline,
    create_render_task,
    get_render_task,
    list_render_tasks,
    RenderStatus,
)

app = FastAPI(
    title="OpenMontage Bridge",
    description="为 GeneralAgent 小说创作工作台提供视频制作能力",
    version="0.1.0",
)

# CORS: 允许 GeneralAgent 前后端调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 请求/响应模型 ──────────────────────────────────────────


class CharacterInput(BaseModel):
    name: str
    persona: Optional[str] = None
    visualHint: Optional[str] = None
    relations: Optional[str] = None


class PipelineProposalRequest(BaseModel):
    content_type: str = Field(
        default="chapter_adaptation",
        description="内容类型: chapter_adaptation | trailer | character_intro",
    )
    has_narration: bool = True
    visual_style: str = "cinematic"


class ScriptGenerateRequest(BaseModel):
    synopsis: str
    characters: list[CharacterInput] = []
    chapter_text: Optional[str] = None
    world_notes: Optional[str] = None
    target_duration_sec: int = 60
    visual_style: str = "cinematic"


class RenderSubmitRequest(BaseModel):
    project_title: str
    pipeline: str = "animated-explainer"
    scene_plan: dict[str, Any] = {}
    config: dict[str, Any] = Field(
        default_factory=lambda: {
            "resolution": "1920x1080",
            "fps": 30,
            "codec": "h264",
        }
    )


# ── API Endpoints ──────────────────────────────────────────


@app.get("/health")
async def health_check():
    """健康检查：确认 Bridge 服务存活且 OpenMontage 可用。"""
    tools_available = False
    tool_count = 0
    tools_path = None
    import_error = None
    try:
        import tools
        tools_path = getattr(tools, "__path__", getattr(tools, "__file__", None))
        from tools.tool_registry import registry
        registry.ensure_discovered()
        tool_count = len(registry.list_all())
        tools_available = tool_count > 0
    except Exception as e:
        import traceback
        import_error = f"{type(e).__name__}: {str(e)}"
        print("Health check discovery failed:")
        traceback.print_exc()

    return {
        "status": "ok",
        "openmontage_root": OPENMONTAGE_ROOT or "(not configured)",
        "tools_path": str(tools_path),
        "tools_available": tools_available,
        "tool_count": tool_count,
        "import_error": import_error,
    }




@app.get("/tools")
async def list_tools():
    """列出 OpenMontage 可用工具和能力。"""
    try:
        from tools.tool_registry import registry
        registry.ensure_discovered()
        summary = registry.provider_menu_summary()
        return {
            "status": "ok",
            "summary": summary,
            "tool_names": registry.list_all(),
        }
    except Exception as e:
        return {
            "status": "degraded",
            "error": str(e),
            "summary": {},
            "tool_names": [],
        }


@app.post("/pipeline/propose")
async def propose_pipeline(request: PipelineProposalRequest):
    """根据内容描述推荐合适的 pipeline 和成本估算。"""
    recommendation = recommend_pipeline(
        content_type=request.content_type,
        has_narration=request.has_narration,
        visual_style=request.visual_style,
    )
    return {"status": "ok", "recommendation": recommendation}


@app.post("/script/generate")
async def generate_scene_plan(request: ScriptGenerateRequest):
    """
    从小说内容生成视频 scene plan（结构化数据）。

    注意：AI 脚本改编由 GeneralAgent 的 Prompt Registry 完成，
    这里只做格式转换，确保输出符合 OpenMontage 的 scene_plan schema。
    """
    scene_plan = novel_content_to_scene_plan(
        synopsis=request.synopsis,
        characters=[c.model_dump() for c in request.characters],
        chapter_text=request.chapter_text,
        world_notes=request.world_notes,
        target_duration_sec=request.target_duration_sec,
        visual_style=request.visual_style,
    )
    return {"status": "ok", "scene_plan": scene_plan}


@app.post("/render")
async def submit_render(request: RenderSubmitRequest):
    """提交渲染任务（异步）。"""
    task = create_render_task(
        project_title=request.project_title,
        pipeline=request.pipeline,
        scene_plan=request.scene_plan,
    )
    return {
        "status": "ok",
        "task_id": task.task_id,
        "render_status": task.status.value,
    }


@app.get("/render/{task_id}/status")
async def render_status(task_id: str):
    """查询渲染任务状态。"""
    task = get_render_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"渲染任务不存在: {task_id}")
    return {
        "task_id": task.task_id,
        "status": task.status.value,
        "progress": task.progress,
        "output_path": task.output_path,
        "error": task.error,
        "cost_usd": task.cost_usd,
    }


@app.get("/render/{task_id}/result")
async def render_result(task_id: str):
    """获取渲染结果。"""
    task = get_render_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"渲染任务不存在: {task_id}")
    if task.status != RenderStatus.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail=f"渲染任务尚未完成，当前状态: {task.status.value}",
        )
    return {
        "task_id": task.task_id,
        "status": task.status.value,
        "output_path": task.output_path,
        "cost_usd": task.cost_usd,
    }


@app.get("/render")
async def list_renders():
    """列出所有渲染任务。"""
    tasks = list_render_tasks()
    return {
        "status": "ok",
        "tasks": [
            {
                "task_id": t.task_id,
                "project_title": t.project_title,
                "pipeline": t.pipeline,
                "status": t.status.value,
                "progress": t.progress,
                "output_path": t.output_path,
                "cost_usd": t.cost_usd,
            }
            for t in tasks
        ],
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("BRIDGE_PORT", "8100"))
    print(f"Starting OpenMontage Bridge on http://localhost:{port}")
    print(f"OpenMontage root: {OPENMONTAGE_ROOT or '(not configured)'}")
    print("Tip: set OPENMONTAGE_ROOT env var to enable tool_registry features")
    uvicorn.run(app, host="0.0.0.0", port=port)
