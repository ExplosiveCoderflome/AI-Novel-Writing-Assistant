# Daydream Engine (白日做梦引擎)
A multi-modal, agentic simulation sandbox designed to materialize human imagination and narrative worlds. 

Languages: [English](README.md) | [简体中文](README_zh.md)

Currently active development path:
`Creative Hub + Auto-Director Initialization + Lore Sandbox Context + End-to-End Production Chain + Style Engine`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![LangChain](https://img.shields.io/badge/AI-LangChain-0EA5E9)
![LangGraph](https://img.shields.io/badge/Agent-LangGraph-7C3AED)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Database](https://img.shields.io/badge/Database-SQLite%20%2B%20Prisma-111827)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

---

## 🌌 Project Vision & Roadmap: The Daydream Continuum

Daydream Engine is not just a standard "you write one sentence, AI completes the next" editor shell. It is a multi-modal sandbox designed to compile raw inspiration into rich interactive worlds. Creative storytelling and generation are structured as a compilation process across multiple stages:

```mermaid
flowchart LR
    A["Raw Inspiration"] --> B["1. Novel Production"]
    B --> C["2. Novel-to-Comic Conversion"]
    C --> D["3. Storyboard Scripting"]
    D --> E["4. Short Drama Synthesis"]
    E --> F["5. Full Cinematic Film"]
    F --> G["6. Virtual World Sandbox (Westworld)"]
    
    style B fill:#bfdbfe,stroke:#2563eb,stroke-width:2px
    style G fill:#fbcfe8,stroke:#db2777,stroke-width:2px
```

1. **Novel Production (First Step - Currently Most Fully Realized)**
   Translates raw ideas and single-sentence prompts into structured, multi-chapter books. Includes automated story structuring, dynamic characters, facts/continuity books, and recursive AI self-editing and quality loops.
2. **Novel to Comic / Manga**
   Extracts visual panels, scenes, character model sheets, and stylistic direction from written novel chapters to compile text into graphic narratives with high visual consistency.
3. **Comic to Storyboard Script**
   Deconstructs comic/graphic sequences and beats into script formats, including camera angles, dialogue audio scripts, stage directions, and actor prompt definitions.
4. **Storyboard to Short Drama / Video (VellumReel Integration)**
   Utilizes text-to-speech (TTS), audio filters, background effects, and generative video systems to stitch storyboard scenes into 9:16 vertical short-form web dramas.
5. **Even Movie / Film**
   Expands pipelines to full cinematic video generation, scaling local models and workflows to generate long-form film content.
6. **Ultimate Goal: World Sandbox (Virtual Westworld)**
   Elevates stories, characters, lore, and laws into an interactive simulation sandbox (similar to a virtual *Westworld*). In this sandbox, AI agents (characters, factions) live, interact, make decisions, and autonomously generate infinite narratives, events, and chronicles.

This system is built both for **complete beginners** who want to generate their first full-length novel, and for **developers** researching AI Native applications, Agent Workflows, LangGraph orchestration, and complex long-running stateful pipelines.

---

## Windows Desktop Version

If you wish to run the pre-built desktop application directly:
- Download page: [GitHub Releases](https://github.com/winnerineast/GeneralAgent/releases)
- Latest Release: [Latest Release Page](https://github.com/winnerineast/GeneralAgent/releases/latest)
- It is recommended to download the `Setup.exe` installer. Alternatively, you can use the `portable` version if you want to run it from a USB drive or temporary directory.
- Public Site: The [GitHub Pages Site](https://winnerineast.github.io/GeneralAgent/) provides live previews, module documentation, and user guides.

## Local Editing via Codex: Ani Book Skill

If you prefer to write and manage your novel workspace in a local terminal using Codex, check out [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill). It manages book-framing, engine runs, chapter steps, and consistency checks directly via local files and steps.

- Use this workspace repository if you want the visual dashboard, model router control, and interactive workbenches.
- Head to [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill) if you prefer Codex terminal-based text creation.

---

## 🛠️ What Has Been Done (Core Capabilities)

### 1. AI Auto-Director & 4 Execution Modes
- Generates structural proposals, project settings, character sheets, and volume guides from a single-sentence prompt.
- Refines proposals, updates title groups, and performs local modifications instead of forcing complete reruns.
- Four execution modes: **Prepare to Write** (beginner friendly), **Auto-Generation (Full Book)**, **Scoped Execution** (entire book, first N chapters, or specific volumes), and **Post-Generation Detection & Correction** (feedback loop).
- Smart checkpoints: Pauses upon quota exhaustion, model failures, or recursive editing failures, enabling complete recovery.
- Automatically promotes pending character proposals after batch runs, reconstructing the character ledger to eliminate consistency drift.

### 2. Creative Hub & Agent Runtime
- A unified creative conversational canvas hosting dialogue, prompt editing, scheduling, tool execution, task progress cards, and round summaries.
- Orchestrated using LangGraph, featuring a Planner, Tool Registry, Runtime, approval steps, and interruption recovery.
- Employs browser notification events to alert users when a background task hits a checkpoint.

### 3. End-to-End Production & Chapter Execution
- Converges single-chapter execution and batch pipeline execution onto the same runtime flow.
- Pre-filters context to inject only characters relevant to the current chapter, preventing context pollution.
- Chapter execution covers generation, AI audit, problem repair, debt logging, character/lore state propagation, and next-chapter setup.
- Out-of-memory issues are prevented via a dynamic LLM rate-limiter that purges old rate-limit instances upon provider changes.

### 4. Book Analysis & Character Visual Evolution
- Deconstructs books into character profiles with 4 depth tiers: Concise, Standard, Deep, and Complete. Deep/Complete tiers query source fragments to build evidence maps.
- **Character Visual Evolution**: Incrementally scans character appearances at 25%, 50%, 75%, and 100% chapter thresholds. Generates stage-specific illustrations based on appearance changes while maintaining facial consistency.
- Provides split-pane readers, source evidence backtracing, token budget guards, and manuscript diagnosis.

### 5. Style Engine & Anti-AI Rules
- Converts writing styles from prompts into reusable, editable assets.
- Extracts style metrics and prose patterns from existing texts to compile customized constraint rules.
- Integrates Anti-AI rules to mitigate typical LLM tropes (e.g., overly formal, generic summaries, clichéd transitions).

### 6. World, Character, & Knowledge Base Integration (RAG)
- Manages faction charts, geography maps, and world mechanics, injecting them directly into the context window.
- Syncs deconstructed books and external documents via vector databases (Qdrant).
- RAG pipelines use parallel indexing, deduplication hash keys, and retrieval traces to debug vector search relevance.

### 7. Virtual World Sandbox Simulation (Westworld Sandbox)
- Implements a complete lock-step turn-based simulation sandbox representing physical and ecological laws of the novel's world (detailed in [world-sandbox-simulation.md](file:///c:/Users/lilin/GeneralAgent/docs/design/world-sandbox-simulation.md)).
- **Earth Physics & Ecology**: Tracks dynamic temperatures (latitude & season modeling, altitude lapse rate, diurnal hour-angle shifts) and predator-prey dynamics using Lotka-Volterra equations.
- **Character Cognitive Agents**: Features memory decay modeling (Ebbinghaus forgetting curve) and spatial rumor diffusion/distortion across adjacent locations.
- **Behavior Trees & LLM Scheduler**: Employs LOD 2 Behavior Trees tracking hunger, energy, and sanity for background characters, while scheduling LOD 1 protagonist decisions using the Sandbox LLM Scheduler.
- **Dramatic Tension & Consistency Audit**: Tracks local and global tension, registers encounters, and audits narrative consistency (such as geography flash-teleportation or deceased characters speaking in drafts) using a virtual camera narrative engine.

### 8. Multi-Modal Adaptation Workbenches
- **Comic Workbench**: Generates panels and sheets. Employs user verification prompts prior to generating images to save credits. Automatically ports book profiles (factions, landmarks, character visuals) into the comic generator.
- **VellumReel Video & Short Drama Pipeline**: Integrated engine mapping storyboard scripts into 9:16 vertical short dramas.
  - **Completely Offline Rendering**: Built-in 6 high-definition hand-drawn ink landscape illustrations for offline fallbacks.
  - **Local High-Fidelity TTS**: Native FastAPI speech server powered by Kokoro-ONNX v1.0 and `misaki[zh]`, enabling offline Chinese/English narration.
  - **Voice Mapping & Prompt Cleaning**: Automatically maps gender attributes (`am_*`/`bm_*` to male voice `zm_yunjian`, `af_*`/`bf_*` to female voice `zf_xiaoxiao`). Cleans character names and stage directions (e.g., `(sighs)`) from the voiceover texts using regex filters.

### 9. Internationalization (i18n) Support
- Fully integrated with `i18next` and `react-i18next` on the client. UI elements, logs, page labels, and settings routes support complete localization between English and Chinese. User language selections are persisted locally.

---

## 🔮 What Is To Be Done (Future Vision)

As the project scales from a novel-writing engine to a full **Daydream Engine**, our future development tasks focus on the following milestones:

### 🎭 Stage 1: Seamless Adaptations (Novel ➔ Comic ➔ Short Video)
- Implement an automated compiler that automatically breaks down written chapters into storyboard cues, feeding directly into the Comic and Video workbenches.
- Build a persistent Visual Style Sheet system ensuring character face, hair, costume, and color scheme consistency across both images and synthetic video.

### 🎬 Stage 2: Storyboard Scripts ➔ Full Cinematic Video
- Expand the local rendering pipeline (VellumReel) to support wider aspect ratios (16:9, 2.39:1) for movie/film pre-production.
- Introduce timeline-based audio/SFX editing, letting users preview dialogue tracks overlaid with ambient environmental tracks.

### 🗺️ Stage 3: Visual Westworld Console & Faction Battles
- Build a web-based visual interface mapping out the geographic grid, faction boundaries, and live character locations for the simulated World Sandbox.
- Integrate multi-agent faction skirmishes and large-scale war campaigns under the lock-step chronology engine.

---

## 🚀 Technical Running Guide

### System Requirements

- **Node.js**: `^20.19.0 || ^22.12.0 || >=24.0.0` (LTS `20.19.x` is highly recommended)
- **pnpm**: `>= 10.6.0` (declared `pnpm@10.6.0` is recommended)
- **LLM API Keys**: At least one valid provider API Key (OpenAI, DeepSeek, SiliconFlow, xAI, etc.). Can be configured post-launch in the settings UI.
- **Qdrant**: Optional. Required for Knowledge Base / RAG indexations.
- **VellumReel Video Pipeline Requirements**:
  - Python `^3.10`
  - System FFmpeg installed and in your environment path (for video stitching and subtitles).
  - ONNX runtime dependencies (local FastAPI TTS server will download Kokoro model weights automatically on its first run).

### 1. Install Dependencies

```bash
pnpm install
```

*Note: The default `pnpm install` only installs packages for Web and Server development. It will not download the Electron runtime.*

- If you only run Web/Server flows, this is sufficient.
- If you want to run the desktop wrapper, it will automatically download Electron when running `pnpm dev:desktop` for the first time.
- You can manually pre-fetch the Electron runtime via:
  ```bash
  pnpm run prepare:desktop-runtime
  ```

#### Troubleshooting Windows Prisma Installation:
If `pnpm install` hangs on `prisma preinstall` on Windows, check:
1. **Node version**: Prisma 7 requires Node `^20.19.0 || ^22.12.0 || >=24.0.0`.
2. **Script-shell setting**: If your npm/pnpm script-shell is set to an interactive shell (e.g., `cmd.exe /k`), Prisma pre-install scripts may hang. Check using:
   ```bash
   node -v
   pnpm config get script-shell
   npm config get script-shell
   ```
   If it returns a value with `/k`, delete it and restart your terminal:
   ```bash
   npm config delete script-shell
   pnpm config delete script-shell
   ```
   Then run `pnpm install` again.

---

### 2. Configure Environment Variables

The project structure separates frontend and backend, with configurations loaded as workspace packages:
- The backend runs in the `server/` workspace and loads `server/.env`.
- The frontend runs in the `client/` workspace and loads `client/.env` or `client/.env.local`.
- The root `.env.example` serves as an overview reference.

#### 2.1 Backend Environment Variables
Duplicate the backend example file:
```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```
Key configurations inside `server/.env`:
- `DATABASE_URL`: Defaults to local SQLite (`file:../prisma/dev.db`), ready to use.
- `RAG_ENABLED`: Set to `false` if you are not using Qdrant/RAG yet.
- `QDRANT_URL` / `QDRANT_API_KEY`: Only required when RAG is enabled.
- API keys (e.g., `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`) can be left blank here and configured in the web UI.

#### 2.2 Frontend Environment Variables
By default, the Vite dev server maps requests to:
`http(s)://[current_hostname]:3000/api`
Therefore, you do not need to configure frontend environment variables for local/LAN environments. Only copy `client/.env` if the frontend and backend are hosted on separate systems or if you want to lock the API base URL.
```bash
# macOS / Linux
cp client/.env.example client/.env

# Windows PowerShell
Copy-Item client/.env.example client/.env
```
Comment out or remove `VITE_API_BASE_URL` for local/LAN automatic mapping.

#### 2.3 Setting Models via UI
Instead of hardcoding models in `.env`, you can manage configurations in the UI:
- `/settings`: Configure API Keys, test connectivity.
- `/settings/model-routes`: Direct specific tasks (planning, writing, auditing) to specific models.
- `/knowledge?tab=settings`: Manage Embedding providers, collections, and reconstruction schedules.

---

### 3. Starting the Development Environment

#### Option A: One-Click Startup (All Services)
```bash
pnpm dev
```
Runs the shared package compiler, Express server, and Vite client concurrently.

#### Option B: Step-by-Step Startup (Recommended for macOS Debugging)
Open three separate terminal tabs/windows:
1. **Terminal 1: Shared Package Compiler**
   ```bash
   pnpm dev:shared
   ```
2. **Terminal 2: Backend Server**
   ```bash
   pnpm dev:server
   ```
   (Starts on `http://localhost:3000`. Generates Prisma clients and pushes DB migrations on startup).
3. **Terminal 3: Frontend Client**
   ```bash
   pnpm dev:client
   ```
   (Starts on `http://localhost:5173`).

#### Option C: Background Service Manager Script (macOS Utility)
A utility helper script is available at [scripts/manage.sh](file:///Users/nvidia/GeneralAgent/scripts/manage.sh):
- **Start all services in background**: `./scripts/manage.sh start`
- **Stop all background services**: `./scripts/manage.sh stop`
- **Check service status**: `./scripts/manage.sh status`
- **Restart all services**: `./scripts/manage.sh restart`

#### Option D: Local Offline TTS Server (For VellumReel Video Voiceovers)
To compile audio narrations offline (will install ONNX/Kokoro packages on first run):
```bash
python scripts/start-local-tts.py
```

#### Default Server URLs:
- Frontend Client: `http://localhost:5173`
- Backend API Server: `http://localhost:3000`
- API Endpoint: `http://localhost:3000/api`
- Local Speech API Server: `http://localhost:8000`

---

### 4. SenseNova Local Multimodal Image Model Setup (Optional)

The system supports offline multi-modal image adjustments and text bubble generation using `SenseNova-U1-8B-MoT-Infographic-V3` running on local Ollama.

#### 4.1 Install Ollama & Pull Model
1. Install [Ollama](https://ollama.com/).
2. Pull the SenseNova model manually, or the server will fetch it on its first call:
   ```bash
   ollama pull sensenova-u1:8b-v3
   ```

#### 4.2 Hardware Self-Diagnosis & Tiers
The server running backend tasks diagnoses your system memory/VRAM on startup and assigns a performance tier:
- **Tier 1 (High GPU Acceleration)**: VRAM $\ge$ 15GB or Mac Unified Memory $\ge$ 32GB. Generates images using BF16/FP16 models (approx. 8 seconds).
- **Tier 2 (Medium GPU Acceleration)**: VRAM 6GB–14GB or Mac Unified Memory 16GB–24GB. Uses INT8/INT4 GGUF models (approx. 30 seconds).
- **Tier 3 (CPU Pure Local)**: No GPU acceleration. Uses CPU execution (approx. 1.5 - 3 minutes).

Ollama serve is launched automatically if the server fails to connect to port `11434` on startup.

#### 4.3 Running SenseNova Tests
- **Run local inference tests**:
  ```bash
  pnpm --filter @ai-novel/server test
  # Or run the SenseNova test script directly:
  node --test server/tests/sensenovaLocalInference.test.js
  ```
- **Run E2E API simulation integrations**:
  While the servers (`pnpm dev`) are running, execute this script to simulate image modifications, local SenseNova API calls, and video rendering:
  ```bash
  node server/scripts/test-e2e-api-simulation.js
  ```

---

### 5. Qdrant Cloud Setup (Optional)

To enable RAG, set `RAG_ENABLED=true` in `server/.env` and follow these steps:
1. Register on [Qdrant Cloud](https://cloud.qdrant.io/).
2. Create a Cluster (the free tier is sufficient).
3. Copy the Cluster URL and API key from the Dashboard.
4. Add them to `server/.env`:
   ```env
   QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
   QDRANT_API_KEY=your_database_api_key
   ```
5. Configure Embedding models in the web application UI (`Knowledge -> Vector Settings`).

Verify connectivity via curl:
```bash
curl -X GET "https://your-cluster.region.cloud.qdrant.io:6333" \
  --header "api-key: your_database_api_key"
```

---

## 🏗️ Technical Stack & Architecture

### Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19 + Vite + React Router + TanStack Query + Plate Editor |
| **Backend** | Express 5 + Prisma 7 + Zod |
| **Orchestration** | LangChain + LangGraph |
| **Database** | SQLite (Primary) + Qdrant (RAG Vector Database) |
| **Workspace** | pnpm workspace Monorepo (pnpm@10.6.0) |
| **Desktop Shell** | Electron (electron-builder packaging) |
| **Node Version** | `^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0` |

### Monorepo Structure

```text
GeneralAgent/
├── client/          # React + Vite Frontend (@ai-novel/client)
├── server/          # Express + Prisma + Agent Runtime (@ai-novel/server)
├── shared/          # Shared types & contracts (@ai-novel/shared)
├── desktop/         # Electron desktop shell (@ai-novel/desktop)
├── docs/            # Design wikis, release notes, and archives
├── images/          # Assets, screenshots, and visual graphs
├── scripts/         # Dev and build management scripts
├── infra/           # Infrastructure configurations (Docker, etc.)
└── .github/         # CI/CD Workflows
```

*For file-by-file counts, file sizes, and audits, review [docs/sourcegraph/project-source-audit.md](./docs/sourcegraph/project-source-audit.md).*

---

### Core Architecture Pillars

To maintain narrative coherence across multi-volume books, the engine relies on five architectural pillars:

| Pillar | Mechanism |
| :--- | :--- |
| **Physical Memory** | Periodically serializes active plots and story summaries into `docs/story_board.json` and `docs/story_ledger.md` to prevent context drift and survive crash recoveries. |
| **Branch isolation (Worktree)** | Separates draft buffers inside `ChapterDraft` databases. Isolates concurrent editing sessions via a `WorktreeManager` prior to a transactional `mergeAndCommit` merge. |
| **Debate Auditing** | Utilizes an `EditorAgent` checking text against Zod-compiled schemas, returning structural edits or blocking flawed text generation. |
| **Self-Checking Heartbeat** | Employs an active background diagnostician reviewing overall narrative discrepancies, printing pending warnings to `docs/STORY_TASKS.md`. |
| **Cockpit Console** | A dashboard showing active agent status, model health ratings, warning flags, and live debate logs. |

---

## 🎨 Visual Previews

### Creative Hub
Unified creation dashboard hosting dialogue, planning, and task runtime steps.
![Creative Hub](./images/创作中枢.png)

### Prompt Editor
Interactive prompting screen where system prompts, variables, and slots are tested.
![Prompt Editor](./images/ScreenShot_2026-07-08_140153_328.png)

### Auto-Director Modes
Direction creation sheets with custom framing, title candidates, and scope parameters.
![Director Create](./images/导演模式-创建.png)
![Director Output](./images/导演模式-创建中.png)

### Volume Strategy & Beat Sheets
Visualized layout mapping volume structures and target chapter outlines.
![Volume Outline](./images/write/卷战略.png)
![Chapter Breakdown](./images/write/节奏拆章.png)

### Comic Workshop & Video Adaptations
Multi-modal workshops drawing assets from the written book and rendering vertical video voiceovers.
![Comic Workshop](./images/漫画工坊.png)
![Video Workshop](./images/视频工坊.png)

---

## 🗺️ Roadmap
- **P0**: Core stability, context memory optimization, checkpoint recovery, and consistency checks.
- **P1**: Streamlining adaptation compiler pipelines (Novels $\rightarrow$ Comics $\rightarrow$ Storyboards $\rightarrow$ Videos).
- **P2**: Introduction of the World Sandbox framework: Faction grids, autonomous character simulations, and live chronicle logging.

## 💬 Community
For feedback, bug reports, and discussions regarding LLM routing, auto-directors, and multi-modal synthesis, join our Q-Group:

![QQ Group](./images/群2.png)

## License
The project is dual-licensed:
- Default: **GNU Affero General Public License v3.0 (AGPLv3)**. Check [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for details.
- SaaS/Commercial Hosting: Accessing or hosting modified versions of this engine to third parties as a service requires a commercial license from the authors. Refer to [CONTRIBUTING.md](./CONTRIBUTING.md) and [CLA.md](./CLA.md) for contribution terms.
