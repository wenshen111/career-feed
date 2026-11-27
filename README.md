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
scripts/update_feed_claude.mjs   Claude 每日更新的脚手架：读 GPT 的文件去重，再合并追加
scripts/lib/              去重（规范化链接、双字相似度）和格式检查的小工具
tests/                    自动测试
.github/workflows/        自动任务：push 时校验；每天定时更新 Claude 的文件
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

## 每日任务的时间

`.github/workflows/daily-claude.yml` 用 UTC 计时：

| 时期 | cron | 意大利时间 |
| --- | --- | --- |
| 冬令时（10 月最后一个周日起） | `47 6 * * *` | 07:47 |
| 夏令时（3 月最后一个周日起） | `47 5 * * *` | 07:47 |

**现在是冬令时，用的是 `47 6 * * *`。** 2027 年 3 月 28 日（周日）切夏令时后要改成 `47 5 * * *`，不改的话会变成 08:47 才跑。GitHub 的定时任务高峰期经常会晚几分钟到半小时开始。

现在每日任务还是**占位**：检查两个文件都在，跑一遍去重合并，放一条“管线测试”的占位情报（只加一次，之后自己去重跳过），校验通过就提交。真正的抓取以后接在 `scripts/update_feed_claude.mjs` 的 `collectCandidates` 里，到时候把这条占位情报删掉。

想马上跑一次：仓库页面 → **Actions** → 左边选“Claude 每日情报” → **Run workflow**。

## 本地跑（可选，需要 Node 20 以上，不用装任何依赖）

```
node --test tests/*.test.mjs                    # 跑测试
node scripts/validate.mjs                       # 校验两个文件
node scripts/update_feed_claude.mjs --dry-run   # 看看今天会写出什么，不改文件
```

## 去重规则（和 App 端保持一致）

`scripts/lib/dedupe.mjs` 按开发说明 6.6 节第 2 条判断“是不是同一件事”。App 端合并时应该用同样的规则：

- 规范化链接：去掉 `http(s)://`、`www.`、结尾斜杠、`utm_*` / `fbclid` / `gclid` 等跟踪参数和 `#锚点`，全部小写。
- 标题相似度：用 v4 `app.js` 的 `bigrams` 切分，**共同双字数 ÷ 两边中较多的那个数**。用较多的一边做分母是一个选择，比用较少的一边严格，短标题不会因为被长标题包含就判成同一件。
