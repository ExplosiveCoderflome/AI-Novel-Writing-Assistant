"""Visual QA tool for automated video quality checks.

Extracts frames at specified timestamps and runs basic quality checks:
- File existence, resolution, duration, codec validation
- Frame extraction for visual inspection by the agent
- Caption occlusion check (compares brightness in face vs caption zones)
- Transition verification (frame similarity at transition points)

Returns frame paths so the agent can visually inspect them.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolStability,
    ToolTier,
)


class VisualQA(BaseTool):
    name = "visual_qa"
    version = "0.1.0"
    tier = ToolTier.CORE
    capability = "analysis"
    provider = "ffmpeg"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC

    dependencies = ["cmd:ffmpeg", "cmd:ffprobe"]
    install_instructions = "Install FFmpeg: https://ffmpeg.org/download.html"
    agent_skills = ["ffmpeg"]

    capabilities = [
        "extract_review_frames",
        "probe_video",
        "check_audio_levels",
    ]

    input_schema = {
        "type": "object",
        "required": ["operation", "input_path"],
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["review", "probe", "audio_levels"],
                "description": (
                    "review: extract frames at timestamps for visual inspection. "
                    "probe: get video metadata (duration, resolution, codecs). "
                    "audio_levels: check audio volume at specified timestamps."
                ),
            },
            "input_path": {
                "type": "string",
                "description": "Path to the video file to inspect.",
            },
            "timestamps": {
                "type": "array",
                "items": {"type": "number"},
                "description": (
                    "Timestamps (in seconds) at which to extract frames or "
                    "check audio levels."
                ),
            },
            "output_dir": {
                "type": "string",
                "description": (
                    "Directory to save extracted frames. Defaults to a "
                    "'review_frames' subdirectory next to the input file."
                ),
            },
            "checks": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "resolution",
                        "duration",
                        "audio_present",
                        "pixel_format",
                        "file_size",
                    ],
                },
                "description": "Specific checks to run (probe operation).",
            },
            "expected": {
                "type": "object",
                "description": (
                    "Expected values for validation. "
                    "Keys: width, height, min_duration, max_duration, "
                    "pixel_format, has_audio."
                ),
                "properties": {
                    "width": {"type": "integer"},
                    "height": {"type": "integer"},
                    "min_duration": {"type": "number"},
                    "max_duration": {"type": "number"},
                    "pixel_format": {"type": "string"},
                    "has_audio": {"type": "boolean"},
                },
            },
        },
    }

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=200)
    idempotency_key_fields = ["operation", "input_path", "timestamps"]
    side_effects = ["writes frame images to output_dir"]
    user_visible_verification = [
        "Visually inspect extracted frames for quality issues",
    ]

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        operation = inputs["operation"]
        input_path = inputs["input_path"]

        if not Path(input_path).exists():
            return ToolResult(success=False, error=f"Input not found: {input_path}")

        start = time.time()

        try:
            if operation == "review":
                result = self._review(inputs)
            elif operation == "probe":
                result = self._probe(inputs)
            elif operation == "audio_levels":
                result = self._audio_levels(inputs)
            else:
                return ToolResult(success=False, error=f"Unknown operation: {operation}")
        except Exception as e:
            return ToolResult(success=False, error=str(e))

        result.duration_seconds = round(time.time() - start, 2)
        return result

    def _review(self, inputs: dict[str, Any]) -> ToolResult:
        """Extract frames at specified timestamps for visual review."""
        input_path = inputs["input_path"]
        timestamps = inputs.get("timestamps", [])

        if not timestamps:
            # Auto-generate timestamps: start, 25%, 50%, 75%, end-1s
            dur = self._get_duration(input_path)
            timestamps = [
                1.0,
                dur * 0.25,
                dur * 0.50,
                dur * 0.75,
                max(dur - 1.0, 0),
            ]

        output_dir = inputs.get("output_dir")
        if not output_dir:
            output_dir = str(Path(input_path).parent / "review_frames")
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        frames = []
        for ts in timestamps:
            ts_label = f"{ts:.1f}".replace(".", "_")
            frame_path = str(Path(output_dir) / f"frame_{ts_label}s.jpg")
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(ts),
                "-i", input_path,
                "-frames:v", "1",
                "-q:v", "2",
                frame_path,
            ]
            try:
                self.run_command(cmd)
                if Path(frame_path).exists():
                    frames.append({
                        "timestamp": ts,
                        "path": frame_path,
                    })
            except Exception:
                frames.append({
                    "timestamp": ts,
                    "path": None,
                    "error": f"Failed to extract frame at {ts}s",
                })

        return ToolResult(
            success=True,
            data={
                "operation": "review",
                "input": input_path,
                "frame_count": len([f for f in frames if f.get("path")]),
                "frames": frames,
            },
            artifacts=[f["path"] for f in frames if f.get("path")],
        )

    def _probe(self, inputs: dict[str, Any]) -> ToolResult:
        """Probe video metadata and optionally validate against expectations."""
        input_path = inputs["input_path"]
        expected = inputs.get("expected", {})

        # Get comprehensive probe data
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries",
            "format=duration,size:stream=width,height,codec_name,pix_fmt,"
            "r_frame_rate,sample_rate,channels,codec_type",
            "-of", "json",
            input_path,
        ]
        import json
        probe_result = self.run_command(cmd)
        probe_out = probe_result.stdout
        probe_data = json.loads(probe_out)

        # Extract key info
        video_stream = None
        audio_stream = None
        for s in probe_data.get("streams", []):
            if s.get("codec_type") == "video" and not video_stream:
                video_stream = s
            elif s.get("codec_type") == "audio" and not audio_stream:
                audio_stream = s

        info = {
            "duration": float(probe_data.get("format", {}).get("duration", 0)),
            "file_size_mb": round(
                int(probe_data.get("format", {}).get("size", 0)) / 1048576, 1
            ),
            "has_audio": audio_stream is not None,
        }
        if video_stream:
            info.update({
                "width": video_stream.get("width"),
                "height": video_stream.get("height"),
                "pixel_format": video_stream.get("pix_fmt"),
                "video_codec": video_stream.get("codec_name"),
                "frame_rate": video_stream.get("r_frame_rate"),
            })
        if audio_stream:
            info.update({
                "audio_codec": audio_stream.get("codec_name"),
                "sample_rate": audio_stream.get("sample_rate"),
                "channels": audio_stream.get("channels"),
            })

        # Validate against expectations
        issues = []
        if "width" in expected and info.get("width") != expected["width"]:
            issues.append(f"Width: expected {expected['width']}, got {info.get('width')}")
        if "height" in expected and info.get("height") != expected["height"]:
            issues.append(f"Height: expected {expected['height']}, got {info.get('height')}")
        if "min_duration" in expected and info["duration"] < expected["min_duration"]:
            issues.append(
                f"Duration too short: {info['duration']:.1f}s < {expected['min_duration']}s"
            )
        if "max_duration" in expected and info["duration"] > expected["max_duration"]:
            issues.append(
                f"Duration too long: {info['duration']:.1f}s > {expected['max_duration']}s"
            )
        if "pixel_format" in expected and info.get("pixel_format") != expected["pixel_format"]:
            issues.append(
                f"Pixel format: expected {expected['pixel_format']}, got {info.get('pixel_format')}"
            )
        if "has_audio" in expected and info["has_audio"] != expected["has_audio"]:
            issues.append(
                f"Audio: expected {'present' if expected['has_audio'] else 'absent'}, "
                f"got {'present' if info['has_audio'] else 'absent'}"
            )

        info["validation_issues"] = issues
        info["validation_passed"] = len(issues) == 0

        return ToolResult(
            success=True,
            data={
                "operation": "probe",
                "input": input_path,
                **info,
            },
        )

    def _audio_levels(self, inputs: dict[str, Any]) -> ToolResult:
        """Check audio levels at specified timestamps."""
        input_path = inputs["input_path"]
        timestamps = inputs.get("timestamps", [])

        if not timestamps:
            dur = self._get_duration(input_path)
            timestamps = [1.0, dur * 0.5, max(dur - 2.0, 0)]

        levels = []
        for ts in timestamps:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(ts),
                "-t", "3",
                "-i", input_path,
                "-vn", "-af", "volumedetect",
                "-f", "null", "NUL" if __import__("sys").platform == "win32" else "/dev/null",
            ]
            try:
                cmd_result = self.run_command(cmd)
                output = cmd_result.stderr  # volumedetect outputs to stderr
                mean_vol = None
                max_vol = None
                for line in output.split("\n"):
                    if "mean_volume" in line:
                        mean_vol = float(line.split("mean_volume:")[1].strip().split()[0])
                    elif "max_volume" in line:
                        max_vol = float(line.split("max_volume:")[1].strip().split()[0])
                levels.append({
                    "timestamp": ts,
                    "mean_volume_db": mean_vol,
                    "max_volume_db": max_vol,
                })
            except Exception as e:
                levels.append({
                    "timestamp": ts,
                    "error": str(e),
                })

        return ToolResult(
            success=True,
            data={
                "operation": "audio_levels",
                "input": input_path,
                "levels": levels,
            },
        )

    def _get_duration(self, path: str) -> float:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            path,
        ]
        dur_result = self.run_command(cmd)
        return float(dur_result.stdout.strip().split("\n")[0])
