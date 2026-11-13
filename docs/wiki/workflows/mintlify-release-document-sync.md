# Mintlify 正式版文档同步边界

## 背景

桌面 Release 的 Windows、macOS x64、macOS arm64 与 Linux 上传任务并行运行。单个平台上传完成不表示完整安装包集合已经发布；在任一上传 job 中直接改 Mintlify 下载地址，可能产生链接指向尚未上传资产的页面。

## 当前规则

- 文档同步从 `workflow_run` 接收 `Desktop Release` 成功完成事件，不在并行的单平台发布 job 内运行。
- 同步器仍须独立查询对应 GitHub Release，并验证 stable `vX.Y.Z` tag、非 draft、非 prerelease，以及五个精确文件名都已出现在 Release assets 中。workflow 成功事件本身不是资产齐套证明。
- 资产合同由 `scripts/sync-mintlify-release.cjs` 的五个文件名模板和测试共同维护。缺少任何一个资产、tag 不稳定、API 失败或 Release 不匹配时，应在读取并计算候选文档后拒绝写入。
- 自动写入范围只有 `mintlify-docs/installation.mdx` 的五个安装链接与 `mintlify-docs/index.mdx` 的版本徽章/文案。不得全局替换历史版本、改动 GitHub stars/forks shields 或重写 changelog 历史。
- release 内容和资产大小不是本同步器的生成内容；没有可靠数据时不补造发布日期、文件大小或营销说明。
- GitHub token 仅用于 Release API 读取及必要的文档提交，不打印 token。提交只包含两个 Mintlify 页面；`site-pages.yml` 监听的 release notes 不参与自动回写。
- Desktop Release 仅由稳定 tag push 启动，因此文档分支上的普通提交不会触发桌面打包。未来若改变 Desktop Release 触发范围，必须重新审查是否会形成同步提交循环。

## 验证方式

- `node --test scripts/tests/mintlify-release-sync.test.cjs` 使用临时目录与假 Release 覆盖资产齐套、缺失/错误资产、stable tag、dry-run 零写入、失败零写入、幂等和历史版本局部性。
- 本地真实查询的预览形式为 `node scripts/sync-mintlify-release.cjs --tag vX.Y.Z --dry-run`，需要 `GITHUB_TOKEN` 读取正式 Release。不得用 fixture 参数代替线上资产核验。
- 发布后若需手工补跑，先确认对应 tag 的正式 Release 与五个上传资产均存在；脚本再次执行相同的资产检查，不允许绕过门槛。

## 相关模块

- `.github/workflows/desktop-release.yml`：并行构建及上传桌面安装包。
- `.github/workflows/mintlify-release-sync.yml`：等待 Desktop Release 完成后启动同步。
- `scripts/sync-mintlify-release.cjs`：Release 校验与有界文档转换。
- `scripts/update-desktop-release-notes.cjs`：只更新 GitHub Release 正文，和 Mintlify 文档同步是不同职责。
