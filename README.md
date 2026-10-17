# Financial Associates · 人生模拟器

东流团队：靳博翔、钭君毅。

资产、目标、收支、投资、保险五个管家围绕同一份财务底账协作；在「未来规划 → 情景推演」中，用两种付款方式经历同一段随机人生。购车 5 年，购房 30 年。剩余资金只计算现金与投资，房车不计入该指标，负债单列。

## 本机启动

使用 Node.js 22。已有 `.env.local` 请保留，不要覆盖密钥。

```sh
npm ci --include=dev
# 首次使用时复制 .env.example 为 .env.local，并填写需要的密钥
DATABASE_URL=file:./financial-associates.db npm run db:migrate
npm run dev:all
```

打开 http://127.0.0.1:3000 。`dev:all` 同时运行 Web、撮合 worker、策略 worker；关闭时一并停止。只查看页面可用 `npm run dev`，实时模拟交易需要 worker。生产运行先 `npm run build`，再 `npm run start:all`。应用目前为本机单用户演示，不是公网多用户服务。

### 安装与 CSS 构建报错

克隆或拉取新增依赖后，先运行 `npm ci --include=dev`，安装成功再启动。开发与源码构建需要完整依赖；不要用 `--omit=dev` 代替开发安装，也不要从别的操作系统复制 `node_modules`。

如果看到 `Cannot find module '@tailwindcss/postcss'`，表示 PostCSS 插件未安装或无法加载，字体文件只是触发 CSS 编译的入口。先停止正在运行的开发服务，然后在项目根目录执行（Windows PowerShell、macOS 均可）：

```sh
npm run repair:install
npm run dev
```

修复命令按锁文件完整重装依赖、清理 `.next` 并检查构建依赖，不删除 `.env.local` 和数据库。安装失败时先处理 npm 的安装错误，不要继续启动。`npm run doctor` 可单独检查 Node.js 与构建依赖。尚未取得修复分支时，也可在停止服务后手动运行：

```sh
npm ci --include=dev
node -e "require('node:fs').rmSync('.next', { recursive: true, force: true })"
npm run dev
```

- 产品库：`prisma/financial-associates.db`，由 `DATABASE_URL` 指定。
- 游戏库：`data/life-simulator.sqlite`，由 `DATABASE_PATH` 指定。
- `npm run db:migrate` 用于新库；已有库停服务后使用 `npm run db:migrate:safe`，先备份并核对业务记录。

## AI 与搜索配置

在 `.env.local` 中填写 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`；豆包搜索 Custom 使用 `DOUBAO_SEARCH_API_KEY`。不要把密钥提交到 Git。

管家优先读取 `OPENAI_*`，游戏优先读取 `LLM_*`；对应字段未配置时互相回退。视觉模型 `OPENAI_VISION_MODEL` 单独配置。AI/搜索故障时手动方案、游戏选择与结算仍能使用，规则说明明确标注来源。

## 演示

点击页面上方「进入独立演示空间」建立虚构底账：126万元现金（含6万元保护资金）、20万元基金、月收入3万元、生活费1.4万元（含4000元租金和500元保费），另有买车、买房目标及合成行情账户。「重置为新演示空间」创建新空间，不覆盖旧数据；可返回原空间。

情景推演默认读取当前底账，先展示来源与排除原因，再由用户确认简化输入。游戏不解除真实资金限制，不把模拟事件记入财务底账。报告需点击保存，游戏进度自动保存。另可选择虚构角色直接体验。

投资管家的合成行情在独立 REPLAY 账户中运行：手动委托后推进下一根 K 线撮合；AI 实验需确认股票池、策略及独立授权，然后点击执行当前时点分析。真实行情资料核验与实时账户保持原规则，合成演示不能当作真实策略收益。

旧入口：`/game` 保留独立 v0.2，`/legacy` 保留早期游戏，`/simulation-archive` 只读查看当前浏览器来源中的原产品存档。不同端口的浏览器存档需在原产品查看或导出。

## 验证与备份

```sh
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
