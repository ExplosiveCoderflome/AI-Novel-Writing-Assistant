# 本地完全离线视频改编与编译工作流

本项目集成了 **VellumReel（卷影）** 本地视频编译系统，支持完全离线的视频生成架构，不依赖任何在线云模型或云渲染 API。

---

## 离线工作流架构

```
小说章节 / 预告大纲
       │
       ▼ (1) 脚本生成：本地 Ollama 结构化推理 (e.g. deepseek-r1:8b)
 结构化分镜脚本 (JSON)
       │
       ├─► (2) 旁白生成：本地 Speech (TTS) 服务 (e.g. Kokoro-82M ONNX) ──► 分段音频文件
       ├─► (3) 画面生成：本地 Stable Diffusion WebUI 自动出图 ─────────► 分镜图像文件
       │
       ▼ (4) 旁白拼接与音量规整 (FFmpeg)
 拼接后完整旁白 (WAV/MP3)
       │
       ▼ (5) 字幕时间轴对齐：本地 Whisper.cpp 分析 ──► 精确字幕文件 (captions.json)
       │
       ▼ (6) 视频编译：本地 Remotion + 浏览器内核 + FFmpeg
 导出 9:16 竖版叙事视频 (.mp4)
```

---

## 环境准备与依赖安装

离线生成对系统本地环境有如下要求：

### 1. 系统二进制依赖
必须确保以下程序已安装且在系统环境变量 `PATH` 中：
* **Node.js 20+**
* **FFmpeg** 与 **ffprobe** (用于音频拼接、分析及 Remotion 视频合成)

### 2. 本地 AI 服务接口
* **Ollama**：访问地址默认为 `http://127.0.0.1:11434`。需确保 Ollama 服务已启动。
* **Stable Diffusion WebUI (A1111) / ComfyUI**：
  * WebUI 启动参数必须包含 `--api` 开启 API 服务。
  * 默认访问地址为 `http://127.0.0.1:7860`。
* **本地 Speech (TTS) 服务**：
  * 推荐使用 Kokoro-FastAPI 提供 OpenAI 兼容的语音合成接口。
  * 默认访问地址为 `http://127.0.0.1:8000/v1`。

---

## 自动拉取本地模型脚本

项目中内置了自动拉取离线模型的脚本 `scripts/pull-offline-models.mjs`。该脚本会自动检测本地服务，并从 Hugging Face 和 Ollama 预加载所需模型。

在项目根目录下运行：
```bash
node scripts/pull-offline-models.mjs
```

### 脚本拉取的模型清单：
1. **Ollama LLM**：向本地 Ollama 发起拉取请求，拉取 `deepseek-r1:8b` (或指定的本地大模型)。
2. **Whisper 对齐模型**：下载 `ggml-small.bin` 语音识别模型，保存至本地 `.cache/whisper.cpp/`，以避免在对齐字幕时进行在线下载。
3. **Kokoro 语音合成模型**：下载 `kokoro-v0_19.onnx` 模型文件与指定的声音特征向量 (`.bin` 格式)，保存至本地 `.cache/kokoro/`。

---

## 在控制台启用完全离线模式

1. 启动项目前后端服务后，进入 **视频改编工作台**。
2. 在左下角找到 **本地离线模型设置** 卡片。
3. 勾选 **开启本地完全离线模式**。
4. 填写您的本地服务配置：
   * **Ollama 模型名称**：例如 `deepseek-r1:8b` 或 `qwen2.5:7b-instruct`。
   * **Stable Diffusion API 地址**：例如 `http://127.0.0.1:7860`。
   * **本地 Speech (TTS) API 地址**：例如 `http://127.0.0.1:8000/v1`。
5. 点击 **保存离线配置**。

开启后，系统在“生成视频脚本”和“提交渲染”时会自动使用本地资源完成推理、语音合成、AI 绘图及 Remotion 视频编译，生成的文件保存在 `tools/vellum-reel/public/assets/projects/<project_id>/` 下，成片将复制到服务端公共静态目录中以供在浏览器中直接预览播放。
