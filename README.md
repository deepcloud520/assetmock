# assetmock · 人生模拟器 v0.1

东流团队，成员靳博翔、钭君毅。

同一段随机人生，两种购车选择。选择虚构角色，确认全款与贷款方案，逐月揭晓18个月的收入、支出和事件，比较剩余资金变化。支持豆包搜索 Custom 查询购车贷款资料，也可使用本地示例。网页条件经用户确认后用于模拟，不代表本人可申请报价或风险预测。

## 启动

需要 **Node.js 22**（`.nvmrc`）。

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

打开 http://127.0.0.1:3000 。若已经有 `.env.local`，不要覆盖它。

在 `.env.local` 填写 `LLM_API_KEY` 可启用AIPing：

```dotenv
LLM_BASE_URL=https://aiping.cn/api/v1
LLM_MODEL=GLM-4.6
LLM_API_KEY=你的密钥
DATABASE_PATH=./data/life-simulator.sqlite
COOKIE_SECURE=false
```

无密钥或服务不可用时，手工方案、预设资料、游戏计算与规则说明仍可使用；界面明确标注降级，不把模板当成AI结果。修改环境变量后重启服务。密钥和SQLite数据均不提交Git。

已适配GLM-4.6的关闭思考模式，以及GLM-5.3的强制思考/低推理强度模式。本次真实验收使用用户配置的GLM-5.3；模型名不要求改回默认值。

## 豆包搜索 Custom 配置

在项目根目录 `.env.local` 添加以下**服务端**变量，保留已有 AIPing 配置：

```dotenv
DOUBAO_SEARCH_API_KEY=你的搜索专用Key
```

进入[搜索 API Key 管理](https://console.volcengine.com/search-infinity/api-key)，选择与已开通套餐对应的 Key。不是火山方舟模型 Key，也不是 AIPing 的 `LLM_API_KEY`。不需要额外填写模型 Endpoint ID、AK/SK 或更改模型地址。保存后重启 `npm run dev`；生产环境配置同名环境变量后重启服务。

点击购车方案页的「读取资料，整理方案」会调用 Custom 搜索，再让现有 AIPing 模型整理目标与条件。页面显示来源、检索时间、原文片段；利率/费用没有明确依据时保持空白。选择「参考这份资料设定条件」，补齐并确认模拟假设后，点击「使用这些条件计算」，再确认开局。网页不会自动变成真实可申请报价。最低利率、平息费率与综合年化成本不会当成名义年利率自动填入。

Custom 使用固定官方端点 `https://open.feedcoopapi.com/search_api/web_search`，`Authorization: Bearer` 鉴权，每次最多5条，15秒超时，无自动重试。模型整理最多35秒；模型失败仍展示搜索来源。搜索只发送购车目标，不发送角色底账。Key 不使用 `NEXT_PUBLIC_` 前缀、不进入浏览器或日志。

未配置搜索 Key 时继续读取示例资料；搜索失败时显示失败原因并保留示例选项。检索状态通过 `/api/profiles` 的 `searchEnabled` 布尔值体现，不返回 Key。源资料和已确认假设按匿名会话存入 SQLite，建局时冻结来源及条件。

```sh
npm run test:search
```

此命令会调用真实 Custom 搜索和已配置的模型，检查来源、资料整理、显式测试假设建局及首月结算。测试中的6%利率和零费用是明确设置的验收假设，**不是从网页提取的真实报价**。输出仅包含来源和状态，不输出密钥。

接口依据：[Custom 官方文档](https://docs.volcengine.com/docs/Networkedsearch/Networkedsearch-2?lang=zh)。复用调研：[火山官方 MCP 搜索实现](https://github.com/volcengine/mcp-server/tree/main/server/mcp_server_askecho_search_infinity)。本项目直接使用 Node 原生 fetch 调用相同 HTTP 接口，无需新增 Python/MCP 服务。

## 文档与数据

- [产品需求文档](./人生模拟器-PRD-v0.1.md)
- [技术实施书](./人生模拟器-技术实施书-v0.1.md)
- [预设贷款资料](./content/示例贷款资料.md)
- [验收记录](./docs/验收记录-v0.1.md)
- 5个虚构角色：`src/domain/fixtures.ts`，GAME-U01—GAME-U05。旧U01仅作历史材料，不参与游戏。
- [补充讨论](./人生模拟器补充讨论.md) 是历史讨论，以v0.1规格和实现为准。

## 验证

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:live
```

`test:e2e`自动启动3100端口、使用独立`data/e2e.sqlite`、关闭真实模型与搜索调用。固定事件只在测试中注入数据库，HTTP不接受指定随机记录。

`test:live`读取本地配置并调用真实模型，会消耗模型服务额度。只有输出`source: model`并返回有效工具链和解释才算真实AI验证通过；不输出密钥。

## 部署

```sh
npm run build
npm start
```

生产服务默认绑定本机；若需对外监听，可使用 `npx next start --hostname 0.0.0.0` 并置于HTTPS反向代理后，设置`COOKIE_SECURE=true`。

反向代理后的外部来源与服务内部协议不一致时，配置`APP_ORIGIN=https://你的站点域名`用于写请求来源校验。

单容器示例：

```sh
docker build -t eastflow-life:0.1 .
docker run --rm -p 3000:3000 --env-file .env.local \
  -e DATABASE_PATH=/app/data/life-simulator.sqlite \
  -v eastflow-life-data:/app/data eastflow-life:0.1
```

镜像不包含`.env.local`；SQLite必须持久化，不支持多副本共享同一库或无持久磁盘的Serverless部署。容器构建是否实测见验收记录。

## 游戏规则

- 2026年11月至2028年4月；金额以分计算。两条路径显示剩余资金（现金＋投资账户），不计入车房价值、不扣负债；现金、投资账户、剩余负债、购车累计已支付金额分别列出。购车累计支付含已付车贷本息及一次性贷款费用，不含用车费。旧局刷新即可使用新展示口径。
- 四类游戏事件独立抽取，无保底，医疗/失业按当前状态判断资格。
- 规则0.1.1：失业触发月起连续3个月工资为0，第4个月以失业前工资的80%重新就业，此后持续按新工资结算；再次失业按当时工资计算。重新就业当月不重复失业，不新增随机抽取。
- 工资与奖金分开显示：原定奖金可能在失业期间到账，不代表恢复工资。旧局及其相同经历重玩保留冻结规则，重新开局使用新规则。
- 同一局两条路径共用抽取记录；重玩可沿用，刷新不会重抽。
- 自动按跌后市值卖基金补足支付；仍不足则该路径停止，保留上个成功月份。
- SQLite事务、月份版本和幂等键保证重复请求不重复扣账；匿名Cookie隔离会话。

## 协作与赛事

开发仓库：https://github.com/likelisa/assetmock 。

主办方赛事仓库：https://git.laisengou.com/LaisenHorizon/14-EastFlow 。

从`dev`创建功能分支，PR先到`dev`，审核后通过`dev → main`合并；不直接向main推送。赛事提交入口：https://hackathon.laisengou.com/#client=participant 。


### 18个月周期更新（规则0.1.2）

新局从2026年11月推进至2028年4月，共18个月。随机记录按本局周期生成，旧12个月存档及相同经历重玩保留原周期；重新开局使用18个月。事件概率不变，第13—18月继续抽卡与结算，奖金仍仅按原计划发放一次，12期债务还清后停止扣款。进度、曲线、月度解释与结局均读取本局周期。

GAME-U01默认无事件局第18月：全款剩余资金255000.00元，贷款剩余资金318336.74元，剩余车贷73140.04元，购车累计支付136663.26元。第12月基准仍为中途检查点。
