# 知识库与向量化管理模块改造

## Summary
- 新增左侧一级栏目 `知识库`，作为向量化资料的唯一管理入口，承接文档上传、版本管理、索引任务、健康状态和 Embedding/RAG 配置。
- 将“上传小说并向量化”从一次性临时输入升级为“独立知识文档资产”：上传后长期保存、可复用、可绑定到小说/世界观，避免各模块重复转化。
- 首版只支持 `txt`，采用前端读取文本后提交 JSON 的方式，不做 multipart 和二进制文件解析。
- 现有世界观向导等直传入口保留，但增加“从知识库选择文档”能力；新资料默认全局可检索，若小说/世界观存在绑定文档，则优先使用绑定文档。

## Key Changes
### 前端与导航
- 左侧导航新增 `知识库` 页面，路由定为 `/knowledge`。
- `知识库` 页面首版分 3 个区域或页签：
  - 文档库：上传 txt、列表、搜索、启用/停用、查看当前激活版本、重建索引、删除/归档。
  - 任务与健康：展示索引任务列表、最近失败任务、Embedding/Qdrant 健康、基础统计。
  - 向量设置：迁入当前 `系统设置` 中的 Embedding/RAG 配置；设置页删除该块，改为跳转提示。
- `ChatPage` 增加知识库文档筛选器，默认搜索所有启用文档，可手动缩小到选中文档。
- `WorldGenerator` 第一步保留现有 txt 直传，同时新增知识库文档选择器；所选文档在创建世界草稿时自动写入世界绑定。
- `WorldWorkspace` 增加“参考知识”绑定管理区，可维护当前世界绑定的知识库文档。
- `NovelEdit` 基本信息区增加“参考知识”绑定管理区，可维护当前小说绑定的知识库文档。

### 数据模型与后端边界
- 新增独立知识库模型：
  - `KnowledgeDocument`：文档元数据、标题、原始文件名、状态、当前激活版本号、最新索引状态、时间戳。
  - `KnowledgeDocumentVersion`：归属文档、版本号、原始纯文本、文本哈希、字符数、创建时间。
  - `KnowledgeBinding`：`targetType = novel | world`、`targetId`、`documentId`，用于持久绑定。
- 扩展 `RagOwnerType`，新增 `knowledge_document`。
- RAG chunk 继续复用 `KnowledgeChunk`；`ownerType=knowledge_document`，`ownerId=documentId`，始终只索引该文档的“当前激活版本”，历史版本只保留原文，不保留在线 chunk。
- 上传同名资料时采用“新版本替换激活”：
  - 创建新 `KnowledgeDocumentVersion`
  - 更新文档当前激活版本
  - 触发 `knowledge_document` rebuild
  - 替换旧 active version 的 chunk
- 保持现有 `/api/rag/health` 和 `/api/rag/jobs` 作为底层运维接口，新模块直接消费；新增知识库业务接口单独放在 `/api/knowledge` 命名空间。

### API / 类型改动
- 新增共享类型：
  - `KnowledgeDocument`
  - `KnowledgeDocumentVersion`
  - `KnowledgeBinding`
  - `KnowledgeHealthStatus` 或等价页面聚合响应
- 新增 REST 接口：
  - `GET /api/knowledge/documents`
  - `POST /api/knowledge/documents`，请求体为 `{ title?, fileName, content }`
  - `GET /api/knowledge/documents/:id`
  - `POST /api/knowledge/documents/:id/versions`，上传新版本
  - `POST /api/knowledge/documents/:id/activate-version`
  - `POST /api/knowledge/documents/:id/reindex`
  - `PATCH /api/knowledge/documents/:id`，启停/归档
  - `GET /api/novels/:id/knowledge-documents` 和 `PUT /api/novels/:id/knowledge-documents`
  - `GET /api/worlds/:id/knowledge-documents` 和 `PUT /api/worlds/:id/knowledge-documents`
- 扩展现有请求：
  - `/api/chat` 增加 `knowledgeDocumentIds?: string[]`
  - `/api/worlds/inspiration/analyze` 增加 `knowledgeDocumentIds?: string[]`
  - 世界草稿创建流程在后端接收并写入世界绑定
- 检索规则固定为：
  - 全局默认搜索所有启用知识库文档。
  - 若当前上下文是小说/世界观且存在绑定文档，则默认优先只搜索绑定文档。
  - 若显式传入 `knowledgeDocumentIds`，则仅搜索这些文档。
  - 业务实体自身的 RAG 内容仍保留，并与知识库结果一起参与融合排序。

### 检索与服务改造
- 在 `HybridRetrievalService` / RAG filter 中增加对 `knowledgeDocumentIds` 的过滤能力。
- 在 `RagIndexService.loadSourceDocuments` 中增加 `knowledge_document` 分支，读取当前激活版本文本进行 chunk 和 embedding。
- 为小说/世界观相关生成链路增加“解析绑定知识文档”的统一 helper，避免每个服务单独拼规则。
- 聊天、世界观生成、小说生成中，统一走“内部实体上下文 + 绑定知识文档/显式知识文档 + 全局知识库回退”的同一检索流程。

## Test Plan
- 上传 txt 文档后，生成 `KnowledgeDocument + Version`，自动入队并成功完成索引，文档页可见状态更新。
- 同一文档上传新版本后，只保留最新激活版本在线检索；旧版本仍可查看但不参与搜索。
- 手动切换激活版本会触发重建，检索结果切换到新激活版本内容。
- 小说绑定文档后，小说生成/章节生成不再依赖重新上传原文，默认命中绑定资料。
- 世界观向导在“直传 txt”和“选择知识库文档”两种路径下都能生成概念卡；选择知识库文档时，创建后的世界自动带上绑定。
- Chat 默认可搜全部启用文档；选择特定文档后，回答只使用所选文档内容。
- `知识库` 页面可正确展示健康状态、任务列表和配置变更；Embedding 设置迁移后原设置仍生效。
- 回归现有 novel/world 内部 RAG：不绑定知识文档时，原有世界观/小说实体检索行为不回退。

## Assumptions
- 新导航名称固定为 `知识库`，不另起“向量库/向量管理”双命名。
- 首版只支持 txt，前端本地解码后提交纯文本 JSON；不支持 pdf/docx/epub。
- 绑定关系首版只支持 `novel` 和 `world`；聊天页只做临时筛选，不做数据库持久绑定。
- 历史版本只保留原文和元数据，不保留历史向量；在线检索永远只针对当前激活版本。
- `系统设置` 中现有 Embedding/RAG 配置迁入 `知识库`，设置页只保留其他系统配置。
- 默认落盘文件名为项目根目录 `KNOWLEDGE_MODULE_PLAN.md`。
