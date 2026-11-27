# career-feed · 每日情报

这是闻神的职业养成 App 的**情报仓库**。Claude 和 GPT 每天各写一个文件，App 启动时把两个都读进来，合并去重后显示在情报站。

## 这里放什么，不放什么

**只放：**

- `feed-claude.json`、`feed-gpt.json`：两个助手每天写的情报。内容都是**公开的招聘、学校、资助、比赛信息**和建议待办。
- 校验和更新用的脚本、格式说明、自动任务配置。

**绝不放（这个仓库是公开的，谁都能看到）：**

- 任何个人数据：收支、照片、修炼进度、v4 的 state、备份文件。
- 任何密钥、token、密码。脚本不需要密钥；自动提交用的是 GitHub 自带的临时令牌，不写在文件里。

个人数据只存在手机本地（和以后可选的私人云账号）。

## 文件结构

```
feed-claude.json          Claude 写（src: "claude"），只有它可以写 adj
feed-gpt.json             GPT 写（src: "gpt"），不能有 adj
schema/feed.schema.json   情报文件的格式（JSON Schema）
scripts/validate.mjs      校验两个文件
scripts/update_feed_claude.mjs   Claude 每日更新：读 GPT 的文件去重，再把当天的候选合并追加
scripts/check_links.mjs   检查情报链接还能不能打开（只提醒）
scripts/check_cross_feed_dupes.mjs   用 App 的合并规则检查两份 feed 之间有没有漏网的重复（只提醒）
lib/merge.mjs             合并去重库：App 直接 import，把两份 feed 合成一个列表
docs/claude-daily.md      Claude 每日情报的工作手册
scripts/GPT每日情报任务指令.md   GPT 每日情报的流程、格式和给 ChatGPT 定时任务的提示词
scripts/lib/              去重（规范化链接、双字相似度）和格式检查的小工具
tests/                    自动测试
.github/workflows/        自动任务：push 时校验；每天体检 Claude 的文件有没有更新
```

## App 怎么读

用 raw 链接（公开，不需要登录）：

- `https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-claude.json`
- `https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-gpt.json`

raw 链接有几分钟缓存，刚提交的内容可能要等一会儿才读得到。

## 格式要点

完整格式见开发说明 6.5 节和 `schema/feed.schema.json`。校验器会拦下这些错：

- 字段缺了、类型不对、`kind` 不在“工作、兼职、学校、联合国、资助、比赛、热点”里、`imp` 不在 1–5。
- 文件名和 `src` 对不上（`feed-gpt.json` 里写了 `"src": "claude"` 之类）。
- `id` 不以自己的 `src` 开头。待办的 `id` 要写成 `claude-todo-2026-11-26-1` 这样，日期用来算 30 天。
- 情报（按 `found`）或待办（按 `id` 里的日期）比 `updated` 早 30 天以上。
- 同一个文件里 `id` 或 `key` 重复。
- **`feed-gpt.json` 里出现 `adj`**。GPT 觉得哪条路线的成功率该变，写在 `note` 里。

只是“提醒”、不会拦下的：有链接但 `key` 不是规范化链接（沿用对方的 key 时正常）、截止日期已过。

## 每天的情报怎么来

1. **07:47（意大利时间）Claude 的定时任务**：按 [`docs/claude-daily.md`](docs/claude-daily.md) 搜集、打开原页核实，写一个临时候选文件，用 `scripts/update_feed_claude.mjs --candidates` 读 GPT 的文件去重后合并，校验通过后直接提交到 `main`。这个定时任务设在 Claude 那边，不在 GitHub 上，用的是闻神现有的 Claude 订阅，不花钱。闻神的个人背景只写在定时任务的指令里，不进这个公开仓库。
2. **08:30（意大利冬令时）GitHub 体检**：`.github/workflows/daily-claude.yml` 校验两个文件，并检查 `feed-claude.json` 今天有没有更新。没更新就失败，GitHub 会给仓库主人发一封失败通知。

体检用 UTC 计时：冬令时 `30 7 * * *`；**2027 年 3 月 28 日切夏令时后改成 `30 6 * * *`**，否则会变成 09:30 才检查。Claude 的定时任务按意大利时区设置，会自己跟着夏令时走。

想马上体检一次：仓库页面 → **Actions** → 左边选“Claude 每日情报体检” → **Run workflow**。

## 本地跑（可选，需要 Node 20 以上，不用装任何依赖）

```
node --test tests/*.test.mjs                    # 跑测试
node scripts/validate.mjs                       # 校验两个文件
node scripts/check_cross_feed_dupes.mjs         # 看两份 feed 之间有没有漏网的重复
node scripts/update_feed_claude.mjs --dry-run   # 看看今天会写出什么，不改文件
```

## 去重规则（和 App 端保持一致）

`scripts/lib/dedupe.mjs` 按开发说明 6.6 节第 2 条判断“是不是同一件事”。App 端合并时应该用同样的规则：

- 规范化链接：去掉 `http(s)://`、`www.`、结尾斜杠、`utm_*` / `fbclid` / `gclid` 等跟踪参数和 `#锚点`，全部小写。
- 标题相似度：用 v4 `app.js` 的 `bigrams` 切分，**共同双字数 ÷ 两边中较多的那个数**。用较多的一边做分母是一个选择，比用较少的一边严格，短标题不会因为被长标题包含就判成同一件。

## 合并逻辑（App 端，`lib/merge.mjs`）

App 读进两个文件后调用一次：

```js
import { mergeFeeds, fingerprintOf } from './lib/merge.mjs'; // 同时要带上 scripts/lib/dedupe.mjs
const { items, todos, maybe, archived, adj } = mergeFeeds(claudeFeed, gptFeed, processed);
```

纯 ES module，不用 Node 的任何模块，浏览器（Vite + 原生 JS）和 Node 20 都能直接用。“是不是同一件”用的就是上面 `dedupe.mjs` 那套，和源头去重一致。

**什么算同一件**（满足任一）

- 情报：规范化后链接相同；或 `key` 相同；或机构相同 + 标题相似度 ≥ 0.75 + 截止日相同或有一方为空。
- 待办：`key` 相同；或文字相似度 ≥ 0.7 + 截止日相差不超过 3 天（有一方没写截止日也算）。
- A 和 C 是同一件、B 和 C 也是，三条合成一条。

**合并后长什么样**

- `srcs: ["claude","gpt"]`，卡片右下角两个小头像。`ids` 列出原来的几个 `id`。
- 两个 `why` 都留着：`views: [{src, why}, …]`。
- `imp` 取较大的再 +1，最多 5。只有两个助手都发了才 +1；同一个助手自己重复发不加（这是一个选择：+1 的意思是“两边都觉得重要”）。没合并的 `imp` 不变。
- 其他字段以先到的为准，空的用后到的补。“先到”：情报看 `found`，待办看 `id` 里的日期；同一天 Claude 算先到（这是一个选择：Claude 07:47 写，GPT 08:40 写）。合并后的 `id` 也用先到的那条，处理状态挂在它上面。
- `adj` 只取 Claude 的，GPT 文件里有也不用。

**处理过的不再冒出来**

处理一条（收下 / 已出击 / 销毁）时，App 调 `fingerprintOf(那一条)`，把结果存进本地的“已处理指纹库”（记下它所有的 `id`、链接、`key`、标题、机构和截止日）。以后调用 `mergeFeeds` 时把指纹库传进去：任何一方再发来、按上面同样的规则对得上的，放进 `archived`（档案柜），不在 `items` / `todos` 里出现。合并组里只要有一条对上，整组归档。指纹库是个人数据，只存在手机上，不进这个仓库。

**拿不准的问一下**

相似度在 0.5 到自动合并线之间的（情报 0.5–0.75，待办 0.5–0.7），不合并，放进 `maybe: [{type, a, b, score}]`，App 在两张卡之间显示小链条图标问“是同一件吗？”。同一个助手自己发的两条不问，那通常是同一机构的两个不同岗位。

**CI 里的检查**

每次 push，`check_cross_feed_dupes.mjs` 用同样的规则把两份 feed 合一遍，只报告，不会让检查失败：

- 被合并、但几条的 `key` 不一样 → **warning**：源头去重漏了，该改发送方的自查。
- 被合并、`key` 都一样 → notice：这是 6.6 第 1 条允许的“对方发过，我有新角度，沿用对方的 key”，正常。
- 进了 `maybe` 的 → notice。

结果在 Actions 那次运行的页面顶上（Annotations）。
