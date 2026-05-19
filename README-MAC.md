# mac 打开方式

## 直接打开

双击项目根目录里的 `启动.command`。

第一次打开会自动安装这个项目需要的本地依赖，时间会久一点；之后再打开会快很多。

## 需要先准备

- Node.js 20.19、22.12 或更新版本
- 能正常访问 npm / Electron 下载源的网络
- 至少一组可用的 AI 模型 API Key

API Key 可以启动后在页面里的模型设置中填写，不需要手动改 `.env` 文件。

## 常见情况

- 如果 mac 提示无法打开 `启动.command`，在终端里进入项目目录执行：`chmod +x 启动.command mac/start-mac.sh`
- 如果启动卡在下载 Electron，通常是网络访问 GitHub Releases 不稳定，换网络或配置代理后再试。
- 如果暂时不使用知识库，启动器默认会关闭 RAG，先跑通写作主流程。

## 打包成 mac 安装包

如果你以后想生成真正的 `.app` / `.dmg`，先双击启动成功一次，再执行：

```bash
pnpm run dist:desktop:mac
```

生成结果会放在 `desktop/build/dist/`。
