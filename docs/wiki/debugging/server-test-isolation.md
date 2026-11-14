# 服务端测试的进程与数据库隔离

## 背景

导演生产适配器复用业务服务，这些服务会在模块加载时持有 Prisma 客户端。把全部测试逐个 `require` 到同一进程，会共享模块缓存、根级测试钩子和单例。单文件通过、联合运行报缺少数据库方法，不足以认定 Prisma schema 或生产装配有问题。

## 当前规则

- `server/scripts/run-tests.cjs` 默认使用 Node 测试运行器按文件隔离进程。fast 沿用最多 4 个文件的并发上限，integration 最多并发 2 个独立进程；`all` 先跑 fast 再跑 integration，不通过提高并发占满四核机器。
- `server/scripts/test-batches.json` 是共享进程批次的显式白名单。只有已经联合验证、不依赖独立模块缓存、全局环境或根钩子的测试才能登记；批次内部使用 `--test-isolation=none --test-concurrency=1`，未登记文件仍按文件隔离。真实 SQLite、环境改写、模块缓存替换和测试运行器自身的隔离夹具不得加入批次。清单缺失时运行器回退为全部按文件隔离，不能用隐式全量共享进程换取速度。
- 清单中的 `serialFiles` 是有子进程超时或严格耗时断言的敏感文件清单。这些文件保持独立进程并串行执行，避免并行负载把既有 60/90 秒子进程超时或毫秒级性能断言变成偶发失败。
- 文件参数以服务端工作目录为基准传相对路径。Windows 命令行存在长度限制，较长的 worktree 路径会使完整套件的绝对路径参数无法启动；启动失败必须输出 `spawnSync.error`，不能只返回一个空日志的失败码。
- 需要真实 SQLite、执行迁移或启动数据库夹具的场景必须进入 `integrationTests`。是否属于集成测试取决于实际副作用；`gateService.test.js` 这类无 SQLite 后缀的文件也可能属于集成测试。
- 快速测试中的数据库调用必须通过测试端口隔离；不能用开发库补齐遗漏的桩。Prisma 模块加载本身可能初始化 SQLite 文件和运行参数，运行验证前应显式指定临时 `DATABASE_URL` 与运行目录。
- Prisma delegate 方法是代理对象，使用 `tests/legacyDirector/databasePorts.js` 的 `stubDatabaseMethod` 保存原方法并通过 `t.after` 恢复。普通模块导出的函数可使用 `t.mock.method`，禁止在文件顶层永久修改模块缓存或导出。
- 替身仅隔离外部读写，业务断言仍应验证真实服务的结果、调用范围及内容保护。不能删除断言或把集成测试移出所有测试分组来获得通过。

## 诊断路径

1. 确认同一个文件独立运行与联合运行是否表现不同。
2. 检查报错对象由哪个模块导出，以及此前加载的测试是否替换 `require.cache`、单例或根级钩子。
3. 在不连接业务库的受控子进程中复现模块加载副作用，检查模块身份和所需数据库方法是否保留。
4. 若隔离后仍失败，保留第一条业务错误，分别核对遗漏的数据库桩、真实数据库场景分组及原业务契约。不能把所有剩余失败都归因于缓存污染。

## Prisma provider 与结果通道

- `prisma generate` 会按 schema 覆盖默认 `@prisma/client` 的 provider；数据库 URL 和 adapter 不会把已生成的 PostgreSQL client 自动变成 SQLite client。`test:all` 会先执行 generate，但不负责数据库迁移。运行前应确认所选 schema 是 SQLite，真实数据库场景通过各自的临时库迁移入口准备表。
- 新增业务读取后，纯单元测试必须补齐持久化端口。例如普通小说夹具应显式让 `manuscriptProject.findUnique` 返回 `null`；不能通过迁移开发库来掩盖未隔离的查询。共享进程批次中的 `beforeEach` 必须限定在所属 suite 内，避免影响其他文件的数据库替身。
- `scripts/acceptance/pg-cloud-harness.cjs` 的 `PG_ADMIN_URL` 用于外层创建隔离库；`pgCloudAcceptance.harness.test.js` 直接要求已准备好的 PostgreSQL `DATABASE_URL`。混合测试应让 PG URL 与单独生成的 PG client 仅进入该文件的子进程，SQLite 父进程必须保留自己的 URL 和默认 client。若使用环境 preload，应检查实际入口 `process.argv[1]`，不能搜索整个 argv：父测试运行器的参数列表也包含 PG 测试文件名，误匹配会使其他测试继承 PG URL。
- 子进程的断言结果须使用专属记录前缀，与业务日志区分。不能从 stdout 中寻找最后一个以 `{` 开头的行再当作 JSON；Node 的多行对象日志也会包含这样的行，且异步日志可能晚于结果输出。`p0bRealPrismaChain.test.js` 使用 `P0B_RESULT=` 标识结果，保留所有业务断言。

## 验证与证据边界

默认环境与预迁移环境的全量结果不能直接归为版本回归。比较结果时必须核对 `DATABASE_URL`、`AI_NOVEL_RUNTIME`、独立生成的 client 与 preload，以及库是否预先建表。`dddef5cb` 的历史成功验收使用提前迁移的临时 SQLite 库和 desktop 模式；`0adfd5ba` 的默认验收没有这项前置准备。两个 tip 的普通测试分组、子进程环境继承、Prisma 初始化与运行时迁移入口未改变。

`createApp()` 只装配应用，`startServer()` 才调用 `ensureRuntimeDatabaseReady()`，且该函数在 web 模式直接返回；导入 Prisma 只配置 adapter 和 pragmas，不建业务表。不能期待路由单元测试自动迁移空库。`autoDirectorChannelCallbacks.test.js` 的普通小说夹具必须隔离 `manuscriptProject.findUnique`；预迁移库上的空表会让遗漏的查询返回 `null`，掩盖隔离缺陷。应在未迁移的独立空库验证此类修复，且保留原有业务断言。

测试运行器的回归应执行真实脚本，在临时目录创建受控测试文件，验证快速模式不执行数据库场景、集成模式仍执行这些场景，以及文件间全局状态不泄漏。只搜索脚本中的名单或参数不能证明执行行为。

嵌套运行 Node 测试运行器时，启动夹具进程前清除继承的 `NODE_TEST_CONTEXT`，避免把父测试运行器的内部身份传给新的独立运行器。

新导演套件通过只证明其覆盖的契约；服务端全套失败、超时或真实正文链路未验收时，仍须明确保留整体验收缺口。测试基础设施改动未触及生产源码时，可以复用同一提交下的已有构建，不必重复构建。

## 相关模块

- `server/scripts/run-tests.cjs`
- `server/scripts/test-batches.json`
- `server/tests/testInfrastructure/runnerIsolation.test.js`
- `server/tests/directorNext/steps/characterPersistence.test.js`
- [章节可靠性隔离验证](./chapter-reliability-isolated-tests.md)
