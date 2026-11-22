# Mintlify 正式版文档同步

## 同步时机

桌面版本号由 `desktop/package.json` 决定，正式 tag 必须是对应的 `vX.Y.Z`。文档站使用已经公开发布的版本。准备或合入下一个桌面版本时，文档下载仍指向最近一次已经齐套的正式安装包。

`Mintlify Release Document Sync` 在正式 tag 的 `Desktop Release` 工作流成功后运行。同步脚本查询该 tag 的 GitHub Release，核对它已公开、不是预发布，且五个平台安装资产均已上传、大小大于零、下载 URL 与资产名称吻合。Windows 安装版、Windows 便携版、macOS arm64、macOS x64 和 Linux x64 缺一项就终止同步。

## 准备发布摘要

发版前根据本次用户可见改动，准备 `docs/releases/mintlify/vX.Y.Z.json`，在合入 `main` 的发版候选中包含它。每条数组内容是一行 Markdown 列表正文，脚本会生成列表符号。

```json
{
  "zh": ["书级方案生成失败时，可以从失败卡重试。"],
  "en": ["Retry book planning from its failure card."]
}
```

中英文应描述相同的改动，按新增、优化、修复顺序写有内容的条目。可以参考同一版本的 GitHub Release 正文或项目发版记录，核对实际提交范围。日期根据 GitHub Release 的 `published_at` 按北京时间生成，根目录 README 与总更新历史继续按日期维护。

## 页面写入范围

- 中文首页的两套主题共用下载入口，脚本更新一处版本标签。英文首页的两个入口各有一处，脚本更新两处。两种语言的 `installation.mdx` 各同步五条下载直链和下载文案中的版本。
- 有双语摘要时，在对应 `changelog.mdx` 顶部各新增一条 `<Update>`。同版本重跑保留现有条目。缺少摘要时，工作流发出警告，首页和下载页继续同步。
- 两份简介链接到各自的更新日志。路线图的当前能力描述和历史版本表按内容需要维护。
- 这些页面存放可直接编辑的 MDX 文本。改动下载卡片或首页标签结构时同步调整脚本和测试。脚本在全部目标内容得出后才开始写入，已有较新下载或首页版本时跳过旧 tag。历史版本条目和 GitHub stars/forks 徽章由各页维护。

工作流在同一个并发队列内串行写入默认分支。Git 推送遇到其他提交时按普通非快进失败处理，从默认分支重跑。Mintlify 从 Git 同步；核验线上时查看两种语言的页面。

## 预览和补跑

- `node --test scripts/tests/mintlify-release-sync.test.cjs` 使用项目实际中英文 MDX 和离线 Release 样例，覆盖下载链接、版本标签、日期、历史保护、旧版本和重复运行。
- `node scripts/sync-mintlify-release.cjs --tag vX.Y.Z --dry-run` 读取真实 GitHub Release，预览变更。设置 `GITHUB_TOKEN` 可使用认证额度。`--release-file` 只用于离线测试。
- 如需补跑，从默认分支手动启动 `Mintlify Release Document Sync` 并填入正式 tag。手动运行使用相同的资产检查和版本保护，也可在补齐双语摘要后用于补写当前版本的日志。
