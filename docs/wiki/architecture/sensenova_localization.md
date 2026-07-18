# SenseNova-U1 100% 本地化部署与集成架构设计

## 背景与设计目标
本项目作为一个 AI-native 的长篇小说创作与衍生工坊 monorepo，要求**所有模型具备 100% 本地化/离线运行的能力**。
为了让 `SenseNova-U1-8B-MoT-Infographic-V3` 多模态模型能够无缝部署于不同操作系统及不同硬件规格的设备上，系统设计并落地了一套自适应多平台多机型本地部署架构。

---

## 1. 硬件自诊断与级别分发 (Hardware Tiering)
系统在用户进入设置页时，调用 [SystemDiagnosticService.ts](file:///c:/Users/lilin/GeneralAgent/server/src/services/image/local/SystemDiagnosticService.ts) 进行硬件自检：
1. **OS 与平台识别**：区分 Windows (win32)、macOS (darwin) 与 Linux (linux)。
2. **算力加速核心探测**：
   * **NVIDIA**: 通过 `nvidia-smi` 命令行查询显卡型号、总显存与空闲显存。
   * **Apple Silicon**: 通过 `sysctl -n hw.optional.arm64` 检测 M系列 芯片（统一内存架构）。
3. **分配运行级别 (Tiers)**：
   * **Tier 1**: 本地显存 ≥ 15GB 或 Mac 统一内存 ≥ 32GB。运行 BF16/FP16 高精度模型。
   * **Tier 2**: 本地显存 6GB-14GB 或 Mac 统一内存 16GB-24GB。运行 INT8/INT4 量化 GGUF 模型。
   * **Tier 3**: 仅有核显/CPU 推理。运行极度量化的 GGUF 模型（单图耗时估算 1.5 - 3 分钟）。

---

## 2. 后端推理子进程守护 (Process Daemon)
在 [LocalInferenceDaemonService.ts](file:///c:/Users/lilin/GeneralAgent/server/src/services/image/local/LocalInferenceDaemonService.ts) 中：
* 每次系统启动时，会在后台检测本地 `127.0.0.1:11434` (Ollama) 的可用状态。
* 若检测不到活跃的推理服务，会自动使用 `spawn` 在后台拉起本地相应的服务守护进程。
* 并在生图调用时，预先验证模型是否已经拉取加载，确保不因模型文件缺失而导致 API 请求挂起崩溃。

---

## 3. 图像局部微调与红框标记 (Inpainting via Red Box)
根据 SenseNova-U1 的 MoT 特性，模型能自动识别画面中以红色边界框圈定的重点编辑区域，并执行指令覆写与气泡纠错。
* **前端实现**：在 [PanelsGridPanel.tsx](file:///c:/Users/lilin/GeneralAgent/client/src/pages/comic/project/PanelsGridPanel.tsx) 的分镜详情弹窗中，若开启局部微调，用户可以直接在图片上拖拽框选绘制红色标记盒。
* **图片合成**：前端通过 HTML5 `<canvas>` 在原图上按框选比例叠加绘制红色线框，并生成 Base64 PNG 发送至后台 `/api/images/edit` 接口。
* **后端落盘**：后端解析接口请求，将编辑后的图像输出持久化至相应的漫画分镜文件，并写入 SQLite 状态，使前端网格能立即刷新拉取微调后的画面。
