"""LTX local video generation."""

from __future__ import annotations

import time

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from tools.video._shared import LTX_LOCAL_VARIANTS, estimate_local_runtime, generate_local_video, local_generation_status, local_install_instructions


class LTXVideoLocal(BaseTool):
    name = "ltx_video_local"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "ltx"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.LOCAL_GPU

    install_instructions = local_install_instructions()
    fallback = "wan_video"
    fallback_tools = ["wan_video", "hunyuan_video", "cogvideo_video", "ltx_video_modal", "image_selector"]
    agent_skills = ["ltx2"]

    capabilities = ["text_to_video", "image_to_video"]
    supports = {
        "reference_image": True,
        "offline": True,
        "native_audio": False,
        "local_gpu": True,
    }
    best_for = [
        "local LTX workflows already tuned around LTX prompting",
        "teams that want one dedicated LTX local path in the registry",
    ]
    not_good_for = ["CPU-only machines"]
    provider_matrix = {key: {"tool": "ltx_video_local", **value, "mode": "local_gpu"} for key, value in LTX_LOCAL_VARIANTS.items()}

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "operation": {"type": "string", "enum": ["text_to_video", "image_to_video"], "default": "text_to_video"},
            "model_variant": {"type": "string", "enum": ["ltx2-local"], "default": "ltx2-local"},
            "reference_image_url": {"type": "string"},
            "reference_image_path": {"type": "string"},
            "width": {"type": "integer"},
            "height": {"type": "integer"},
            "num_frames": {"type": "integer"},
            "num_inference_steps": {"type": "integer"},
            "enable_model_offload": {"type": "boolean", "default": True},
            "seed": {"type": "integer"},
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(cpu_cores=2, ram_mb=16000, vram_mb=12000, disk_mb=4000, network_required=False)
    retry_policy = RetryPolicy(max_retries=1)
    idempotency_key_fields = ["prompt", "model_variant", "operation", "seed"]
    side_effects = ["writes video file to output_path", "may download model weights"]
    user_visible_verification = ["Watch generated clip for motion coherence and artifacts"]

    def get_status(self) -> ToolStatus:
        return local_generation_status()

    def estimate_cost(self, inputs: dict[str, object]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, object]) -> float:
        return estimate_local_runtime(LTX_LOCAL_VARIANTS["ltx2-local"]["speed"])

    def execute(self, inputs: dict[str, object]) -> ToolResult:
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error="Local LTX video generation is unavailable. " + self.install_instructions)
        start = time.time()
        try:
            result = generate_local_video(tool_name=self.name, variants=LTX_LOCAL_VARIANTS, default_variant="ltx2-local", inputs=inputs)
        except Exception as exc:
            return ToolResult(success=False, error=f"Local LTX video generation failed: {exc}")
        result.duration_seconds = round(time.time() - start, 2)
        return result

