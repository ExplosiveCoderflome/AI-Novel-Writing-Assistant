# 发版验证门面

`guard.cjs` 拥有版本／tag 关系、当前提交验证与隔离检查环境；`check.cjs` 只验证、不创建 tag、不上传。创建 tag 的入口仍是 `trigger-desktop-release.cjs`，上传入口仍是桌面 builder 包装器。任一入口不得将失败检查转换成 warning 后继续。

检查顺序为类型检查、全新测试库迁移、server/client 完整测试、desktop 编译、desktop/script 契约测试。临时测试目录会打印并保留，便于失败诊断；它不能指向现有小说数据库。不要添加“跳过测试”开关，或以外部 success 布尔值代替同一提交的实际检查。

版本来自 desktop/package.json，公共 tag 只能是 vX.Y.Z。GitHub 上传还需要匹配的 tag ref、当前 HEAD 和 main 归属。目录打包及 workflow_dispatch 可不带 tag，但必须使用 publish never。详细流程见开发 wiki 的桌面发布规则。
