# OpenMontage Bridge

将 OpenMontage 的视频制作能力通过 REST API 暴露给 GeneralAgent。

## 启动方式

```bash
cd tools/openmontage-bridge
pip install -r requirements.txt
python server.py
```

默认端口 `8100`，可通过 `BRIDGE_PORT` 环境变量覆盖。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BRIDGE_PORT` | `8100` | Bridge 服务监听端口 |
| `OPENMONTAGE_ROOT` | *(空)* | 指向 OpenMontage 项目根目录。设置后启用 `tool_registry` 功能（工具发现和真实渲染）。不设置则 Bridge 仅提供适配层和渲染任务管理，不调用外部工具。 |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/tools` | 列出 OpenMontage 可用工具 |
| POST | `/pipeline/propose` | 推荐合适的 pipeline |
| POST | `/script/generate` | 将小说内容转换为 scene_plan |
| POST | `/render` | 提交渲染任务 |
| GET | `/render/{task_id}/status` | 查询渲染状态 |
| GET | `/render/{task_id}/result` | 获取渲染结果 |
| GET | `/render` | 列出所有渲染任务 |

## 与 GeneralAgent 的关系

```
GeneralAgent Server ──HTTP──> OpenMontage Bridge (:8100)
                                  │
                                  ├─ adapters.py    (格式转换 + 任务管理)
                                  └─ tools.*        (可选，需要 OPENMONTAGE_ROOT)
```

- **AI 脚本生成**由 GeneralAgent 的 Prompt Registry 完成（`video.novel_to_script`、`video.novel_trailer`）
- **Bridge** 做格式对齐和渲染任务管理
- **OPENMONTAGE_ROOT** 设置后可调用 OpenMontage 原生工具链进行真实渲染
