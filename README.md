# Financial Associates · 人生模拟器

东流团队：靳博翔、钭君毅。

资产、目标、收支、投资、保险五个管家围绕同一份财务底账协作；在「目标管家 → 未来可能性推演」中，用两种付款方式经历同一段随机人生。购车 5 年，购房 30 年。剩余资金只计算现金与投资，房车不计入该指标，负债单列。

## 本机启动（Windows / macOS）

首次准备 **Node.js 22**、**Python 3（含标准库 sqlite3）** 和 Git。安装 Python 时将其加入 PATH，并重新打开终端。项目自动检测 `python3`、`python`、Windows 的 `py -3`；有多个解释器时，可在 `.env.local` 设置 `PYTHON_EXECUTABLE` 为可执行文件完整路径，不要附带命令参数。

克隆后，在仓库目录运行：

```sh
npm ci --include=dev
npm run dev
```

打开 http://127.0.0.1:3000 。无需手动创建数据库文件、执行 SQL 或导入示例。

启动会依次检查环境、在没有环境配置文件时创建 `.env.local` 模板、生成 Prisma 客户端、初始化数据库／应用迁移、建立或复用独立演示空间，再启动 Web、撮合 worker 和策略 worker。首次打开的新浏览器直接进入带有明显“演示数据”标识的空间；已有浏览器所选工作区保持不变。可以点击「进入个人空间」创建空白底账，演示数据不会混入其中。

- API Key 可在自动创建的 `.env.local` 中填写，也可先复制 `.env.example` 再启动；未配置时手动功能仍可使用。已有 `.env` / `.env.local` 不覆盖。
- 产品库默认 `prisma/financial-associates.db`，由 `DATABASE_URL` 指定；相对路径统一相对于 `prisma`。
- 游戏库默认 `data/life-simulator.sqlite`，由 `DATABASE_PATH` 指定；相对路径相对于项目根目录。
- 再次启动保留原数据和已有演示。发现待执行迁移时，先将已有产品库备份到 `.local-data/backups`（可由 `DATABASE_BACKUP_DIR` 配置），校验成功后才迁移。
- 遇到失败迁移、迁移历史不匹配或无法备份，启动会停止并显示原因，绝不自动 reset。直接退出失败命令后不要继续启动另一份服务。
- 停止应用用 `Ctrl+C`；Web 和两个 worker 一起退出。同一数据库不允许重复启动实例。

`npm run setup` 可提前完成初始化；`npm run dev:web` 仅启动网页（仍会初始化），`npm run dev:all` 是完整启动别名。生产运行使用 `npm run build` 后再 `npm start`，同样自动初始化。源码启动／构建需要完整依赖，请保留 `--include=dev`。

### 环境排查

```sh
npm run doctor
```

该命令检查 Node.js、构建依赖和可用的 Python 3。缺少 Python 时会在启动前给出安装提示，不会等首页请求才报 `spawn python3 ENOENT`。

如果看到 `Cannot find module '@tailwindcss/postcss'`，先停止开发服务，执行：

```sh
npm run repair:install
npm run dev
```

修复命令按锁文件重新安装完整依赖并清理 `.next`，不删除环境配置和数据库。不要跨操作系统复制 `node_modules`。运行时的日常备份失败会在首页显示提醒并允许重试；迁移和恢复前的备份失败则停止相关操作。

## AI 与搜索配置

在 `.env.local` 中填写 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`；豆包搜索 Custom 使用 `DOUBAO_SEARCH_API_KEY`。不要把密钥提交到 Git。

管家优先读取 `OPENAI_*`，游戏优先读取 `LLM_*`；对应字段未配置时互相回退。视觉模型 `OPENAI_VISION_MODEL` 单独配置。AI/搜索故障时手动方案、游戏选择与结算仍能使用，规则说明明确标注来源。

## 演示

首次启动自动建立独立演示空间，也可点击页面上方按钮创建新演示。虚构底账包含：126万元现金（含6万元保护资金）、20万元基金、月收入3万元、生活费1.4万元（含4000元租金和500元保费），另有买车、买房目标及合成行情账户。「重置为新演示空间」创建新空间，不覆盖旧数据；可进入个人空间。

从「目标管家」顶部的「未来可能性推演」可直接进入游戏。默认读取当前底账及当前规划目标，先展示来源与排除原因，再由用户确认简化输入。游戏不解除真实资金限制，不把模拟事件记入财务底账。报告需点击保存，游戏进度自动保存。另可选择虚构角色直接体验。

投资管家的合成行情在独立 REPLAY 账户中运行：手动委托后推进下一根 K 线撮合；AI 实验需确认股票池、策略及独立授权，然后点击执行当前时点分析。真实行情资料核验与实时账户保持原规则，合成演示不能当作真实策略收益。

旧入口：`/game` 保留独立 v0.2，`/legacy` 保留早期游戏，`/simulation-archive` 只读查看当前浏览器来源中的原产品存档。不同端口的浏览器存档需在原产品查看或导出。

## 验证与备份

```sh
npm run test:startup        # 干净建库、启动两个worker与网页、备份、重复启动与升级保护
npm test                    # 独立临时数据库、分组回归，不使用个人库
npm run test:e2e             # 独立3100端口、临时演示数据库
npm run typecheck
npm run lint
npm run test:live:v2         # 真实搜索、模型目标整理、事件解释与重玩建议
npm run test:live:integrated # 新建独立演示空间，验证管家与底账方案整理
```

页面内的数据管理备份针对产品库。完整保留游戏进度，请停止 Web 与两个 worker 后执行：

```sh
npm run backup:all -- --stopped
# 恢复前仍须停止全部服务；命令先保存当前两库，再校验和恢复
npm run backup:all -- --stopped --restore .local-data/bundles/<备份目录>
```

数据库恢复后的实时策略需要重新核对授权；完整备份含本机数据，不提交到代码仓库。backup:all 生成的离线备份属于手工备份，页面永久清除操作不会删除这些副本，需要自行清理。

## 开发与文档

功能分支 PR 目标为 `dev`，审核后集成；最终通过 `dev → main` 审核，不直接推送 main。

- [整合 PRD](docs/整合-PRD-v0.3.md)
- [整合技术说明](docs/整合-技术实施书-v0.3.md)
- [本次验收记录](docs/整合-验收记录-v0.3.md)
- [源代码导入清单](docs/import-financial-associate.json)
- [原游戏 v0.2 规则](人生模拟器-PRD-v0.2.md)
