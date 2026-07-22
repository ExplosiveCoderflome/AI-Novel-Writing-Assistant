# 本地完全离线视频改编与编译工作流

本项目集成了 **VellumReel（卷影）** 本地视频编译系统，支持完全离线的视频生成架构，不依赖任何在线云模型或云渲染 API。

---

## 离线工作流架构

```
小说章节 / 预告大纲
       │
       ▼ (1) 脚本生成：本地 Ollama 结构化推理 (e.g. gemma4:e4b)
 结构化分镜脚本 (JSON)
       │
       ├─► (2) 旁白生成：本地 Speech (TTS) 服务 ──► 分段音频文件 (若离线，由 ffmpeg 生成静音占位符)
       ├─► (3) 画面生成：本地 Stable Diffusion WebUI ──► 分镜图像文件 (若离线，由 ffmpeg 生成单色占位图)
       │
       ▼ (4) 旁白拼接与音量规整 (FFmpeg)
  拼接后完整旁白 (WAV/MP3)
       │
       ▼ (5) 字幕时间轴对齐：本地 Whisper.cpp 分析 ──► 精确字幕文件 (captions.json，含时长强制截断防溢出)
       │
       ▼ (6) 视频编译：本地 Remotion + 浏览器内核 + FFmpeg (Windows 需通过 props.json 传输参数)
  导出 9:16 竖版叙事视频 (.mp4)
```

---

## 避坑指南与开发规约 (Windows/本地离线适配)

在 Windows 环境下运行离线 Remotion 编译和本地大模型时，有几个非常关键的底层系统级踩坑点，已在相关脚本中实现修复。后续扩展或重构必须遵守以下规约：

### 1. Windows 的 `npx` 必须执行为 `npx.cmd` 且启用 `shell: true`
在 Node.js 中使用 `execFileSync` 或 `spawnSync` 启动 `npx` 时：
* 直接调用 `npx` 在 Windows 上会抛出 `ENOENT`，因为 Windows 下 `npx` 不是独立的可执行文件，而是脚本。
* 必须将其解析为 `npx.cmd`，且在 `execFileSync` 的 `options` 选项中显式设置 `{ shell: true }`，否则 Windows 无法调用命令解释器并会抛出 `EINVAL` (参数无效) 错误。

### 2. 避免在命令行中直接传输超长 JSON 参数 (使用 `props.json`)
* Windows `cmd.exe` 存在 8191 字符的命令行最大长度限制。此外，双引号 `"` 在命令行参数逃逸时在 Windows 批处理中极易解析崩溃，导致 `EINVAL`。
* 不要通过 `--props='{...}'` 传输包含全量分镜和数十行字幕的 JSON 参数。
* **规约**：将属性序列化写入临时的 `out/<project_id>/props.json` 文件，然后以 `--props=out/<project_id>/props.json` 形式调用 Remotion CLI，该方法跨平台安全且无长度限制。

### 3. Zod 时间字段兼容浮点数 (避免 `.int()`)
* 本地模型在设计分镜时长时，常常生成带有半秒的微剪辑（如 `4.5` 秒、`7.5` 秒），以实现更加精确的情感与镜头切换节奏。
* **规约**：视频分镜的 Zod 校验 Schema 中，`durationSec` 必须定义为普通的 `z.number()` 而不能限制为 `.int()`。否则，当大模型输出带小数的时长时，JSON schema 校验和 LLM 自我修正阶段将陷入死循环，引发 `StructuredOutputError`。

### 4. 本地 Whisper 静音 Hallucination (幻听) 处理
* 当 Stable Diffusion 或 TTS 离线时，系统为了保证流程完整，会使用 `ffmpeg` 生成对应的静音 MP3。
* OpenAI Whisper 对长时间静音进行对齐时，极易陷入**幻听循环**，重复解析出最后一句话（如“我只想要你和我一起走”），且生成的时间戳会溢出，超过实际音频文件总时长。这会导致 VellumReel 视频项目校验抛出 `caption X 超出视频时长` 错误而中断。
* **规约**：在 [transcribe-local.mjs](file:///c:/Users/lilin/GeneralAgent/tools/vellum-reel/scripts/transcribe-local.mjs) 生成字幕后，必须在写入文件前，过滤所有 `startMs >= totalMs` 的字幕，并将 `endMs` 强制与 `totalMs`（项目总时长）取最小值（`Math.min(endMs, totalMs)`）进行截断。

### 5. 渲染轮询超时限制
* Remotion 本地视频编译涉及 Webpack 构建、Chromium 无头浏览器逐帧渲染及 FFmpeg 二进制编码转码，是高计算强度的密集型任务，一个 60 秒的视频渲染一般需要 **1.5 至 3 分钟**。
* **规约**：在任何自动化脚本（如 `test-offline-e2e.ts`）中轮询渲染状态时，轮询等待的时长必须保证在 **5 到 8 分钟以上**（例如 100 次轮询 * 5秒延时）。绝对不能过早退出并调用 `process.exit(0)`，这会触发孤儿进程清理，将正在执行渲染的 Remotion 子进程强制杀死。

---

## 环境准备与依赖安装

离线生成对系统本地环境有如下要求：

### 1. 系统二进制依赖
必须确保以下程序已安装且在系统环境变量 `PATH` 中：
* **Node.js 20+**
* **FFmpeg** 与 **ffprobe** (可使用 `scoop install ffmpeg` 自动安装配置到 Windows PATH)

### 2. 本地 AI 服务接口
* **Ollama**：默认访问地址为 `http://127.0.0.1:11434`。推荐准备本地模型 `gemma4:e4b`。
* **Stable Diffusion WebUI**：API 必须携带 `--api` 开启，默认 `http://127.0.0.1:7860`。
* **本地 Speech (TTS) 服务**：默认 `http://127.0.0.1:8000/v1`。
