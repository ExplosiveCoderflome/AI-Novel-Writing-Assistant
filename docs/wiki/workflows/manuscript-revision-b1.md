# 长篇原稿修订的来源与基线合同

## 背景与边界

导入已有小说与从大纲开书不是同一流程。原稿是用户资产，不能用生成器重建，也不能覆盖已有作品。B1 只创建新的长篇修订副本；短篇导入独立验收，不伪造 Segment 或导演任务。

## 来源与分区

`ManuscriptSource.rawBytes` 保留原始文件，`sourceText` 是严格解码后的完整 UTF-16 文本；rawHash 与 sourceHash 分别校验，不自动规范化 CRLF、空行、标点和 emoji。BOM 优先于界面默认编码，无法严格解码时要求明确重选编码。20 MiB / 300万 UTF-16 单位 / 3000 正文单元是拒绝上限，不是截断长度。

分区必须从 0 连续覆盖到 sourceText.length，不能重叠、留缝或切开代理对。正文、目录、前后文和人工核对区都有明确去处。全文扫描的标题只是待核对候选，同名标题不代表同一个单元，也不能据此自动合并人物或正文。

## 维护规则

来源不可经 PUT 覆写。修改章节工作稿不改变 sourceRanges；无原稿的新章用空 ranges 明确标识。规则识别不宣称模型已理解全书，用户必须核对区间和角色；无标题可明确确认全文一章。

## 原子物化与只读对照

导入确认在单个 Prisma 事务中创建 Novel、全部 Chapter 和稳定 Unit→Chapter 映射，再确认 Session；任一写入失败都回滚。章节正文直接采用 sourceText.slice，不 trim、补标题或调用 writer/diagnose。独立 importRequestKey 与 confirmedRequestKey 分别保护来源创建与物化重放，改载荷不能沿用原请求。

工作稿 hash 使用原始正文 SHA256，不能拿派生同步中规范化空白的短 hash 代替保存 CAS。Source 下载返回原始字节；合并后对照按全部 sourceRanges 连接，不仅读第一段。初次导入不自动重放所有事实/时间线消费者。
