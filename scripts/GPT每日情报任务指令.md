# GPT 每日情报 · 任务指令

这份文档给 GPT 的 ChatGPT 定时任务用，和 Claude 那边的 [`docs/claude-daily.md`](../docs/claude-daily.md) 对称：GPT 每天写 `feed-gpt.json`，格式同《GPT说明-职业养成App》6.5 节，去重按 6.6 节。

这个仓库是公开的。所以这里只写流程、格式和提示词；**闻神的个人背景不写在这里**，只粘贴在 ChatGPT 的定时任务里（第 7 节的【我的背景】那一格）。这里也不放任何密钥。

---

## 0. 闻神要做的事（三步）

1. 选交付路径：**A**（GPT 直接写进仓库）还是 **B**（GPT 在推送末尾附 JSON，你粘贴进仓库）。看第 6 节。拿不准就先用 B，A 的“定时任务往 GitHub 写入”现在不稳（见 6.1 的说明）。
2. 打开 ChatGPT，新建一个定时任务（例如对它说“每天 08:40（意大利时间）运行下面这个任务”，或在定时任务的设置里新建），把第 7 节的**主提示词**整段粘进去，再接上你选的 **A 段**或 **B 段**，最后把【我的背景】换成你的背景。
3. 第一天手动运行一次，按第 8 节对一遍结果。

时间只是建议：08:40 在 Claude 的 07:47 之后，GPT 读到的 `feed-claude.json` 已经是当天的，去重才有意义。要换时间，只要保持在 07:47 之后。

---

## 1. GPT 每天跑什么、交出什么

**每天的步骤**

1. 读两份公开文件（不用登录）：
   - Claude 的：`https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-claude.json`
   - 自己的（上一版）：`https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-gpt.json`
2. 搜集今天的新机会（第 4 节），每条**打开原始页面或 PDF 核实**。
3. 按第 3 节去重。
4. 把新内容追加到自己上一版的文件里，删掉 30 天以前的，写成**完整的** `feed-gpt.json`（第 2 节）。
5. 按第 5 节的检查清单自查一遍。
6. 交付（A 或 B，第 6 节），并发一条推送。

**每天交出两样东西**

- 一条给闻神手机的推送：中文，三行以内，写今天几条、最值得看的一条、截止最近的是哪天。
- 一份完整的 `feed-gpt.json`：A 路径直接写进仓库；B 路径附在推送末尾。

---

## 2. `feed-gpt.json` 的格式

```json
{
  "src": "gpt",
  "updated": "2026-11-28T08:40:00+01:00",
  "items": [
    {
      "id": "gpt-2026-11-28-example-grabungstechniker",
      "key": "example.de/jobs/grabungstechniker-123",
      "found": "2026-11-28",
      "kind": "工作",
      "title": "Grabungstechniker*in (m/w/d)",
      "org": "某考古公司",
      "loc": "德国巴伐利亚，雷根斯堡",
      "pay": "TVöD E8，约 €3,300–3,700/月（税前）",
      "deadline": "2026-12-15",
      "imp": 4,
      "why": "一句话：她为什么该投或不该投（GPT 自己的角度）",
      "link": "https://example.de/jobs/grabungstechniker-123?utm_source=x"
    }
  ],
  "todos": [
    { "id": "gpt-todo-2026-11-28-1", "key": "给某考古公司发邮件问签证担保", "t": "给某考古公司发邮件问签证担保", "due": "2026-12-02", "why": "一句话", "rel": "tech" }
  ],
  "note": "今天给她的一句话"
}
```

**字段规则**（仓库的校验器会按这些拦）

| 字段 | 规则 |
| --- | --- |
| `src` | 永远是 `"gpt"`。 |
| `updated` | 这次运行的时间，带时区。冬令时 `+01:00`，夏令时（3 月最后一个周日到 10 月最后一个周日）`+02:00`。 |
| **`adj`** | **不允许出现，连 `"adj": {}` 也不行。** 觉得哪条路线的成功率该变，写进 `note`，闻神会转给 Claude。 |
| `items[].id` | `gpt-YYYY-MM-DD-简短英文` ，日期是发现那天。必须以 `gpt-` 开头，整个文件里不重复。 |
| `items[].key` | 去重用。有链接就写**规范化链接**：去掉 `http://` 或 `https://`、`www.`、结尾的 `/`、`#` 后面的部分、`utm_*` / `fbclid` / `gclid` / `mc_cid` / `mc_eid` 参数，然后全部小写。上面例子的 key 就是这么来的。没有链接写“机构 + 标题”。和 Claude 是同一件事时，**照抄 Claude 的 key**。 |
| `items[].found` | 发现日期 `YYYY-MM-DD`。 |
| `items[].kind` | 只能是：工作、兼职、学校、联合国、资助、比赛、热点。 |
| `items[].imp` | 整数 1–5。5 = 非常对口而且现在就该投；4 = 对口；3 = 值得看；2 = 边缘；1 = 只是知道一下。 |
| `items[].why` | 必填，一句话，见第 4、5 节。 |
| `org` `loc` `pay` `link` | 可选，但能写就写。`link` 必须以 `http://` 或 `https://` 开头，写原始页面或 PDF 的地址，不写聚合站。 |
| `deadline` | `YYYY-MM-DD`；没有截止日期写 `""`。 |
| `todos[].id` | `gpt-todo-YYYY-MM-DD-序号`，例如 `gpt-todo-2026-11-28-1`。日期用来算 30 天。 |
| `todos[].key` | 一般和 `t` 相同。 |
| `todos[].t` | 待办本身，今天就能动手的具体动作。 |
| `due` `why` `rel` | 可选。`rel` 写相关的情报 id 或路线 id（路线表在【我的背景】里）。 |
| `note` | 必填，可以是 `""`。 |

**只保留 30 天**：`found` 或待办 id 里的日期比 `updated` 早 30 天以上的，删掉。不删校验会失败。

**不准写进文件的字段**：上面没有列出的字段一律不写（例如 `srcs`、`views`、`newAngle`、`source`）。

---

## 3. 源头去重（6.6 第 1 条）

写之前先读 `feed-claude.json` 和自己上一版的 `feed-gpt.json`。两条算“同一件事”，满足任一就算：

- 规范化后的链接相同；
- `key` 相同；
- 机构相同、标题几乎一样、截止日期相同或有一方为空。

遇到同一件事：

- **Claude 已经发过，你没有新角度**：不发。
- **Claude 已经发过，你有新角度**（另一个理由、一个隐藏的门槛、PDF 里写的工资档、更合适的投递方式、截止日期变了）：发，`key` **照抄 Claude 的**，`why` **只写新角度**，不重复 Claude 说过的话。
- **你自己前几天发过**：不再发，除非截止日期或条件变了；变了就改原来那一条，不新增。

读不到 `feed-claude.json`（打不开、超时）：照常搜集，但在 `note` 里写一句“今天没读到 Claude 的文件，可能有重复”。不要假装去过重。

---

## 4. 找什么：筛选规则

### 4.1 优先 Claude 够不到的源

Claude 的抓取对很多 PDF、需要登录的招聘系统和很长的招聘公告读不全。**GPT 偏重这三类**，这是两边分工的意义：

1. **PDF 公告**：招聘公告、Ausschreibung、call for applications、ToR（Terms of Reference）、投标文件、奖学金章程。要把 PDF 里的工资档、语言要求、国籍限制、截止日期读出来写进 `why` 或 `pay`。
2. **ATS 招聘系统**：Workday、SuccessFactors、Taleo、Greenhouse、Lever、Personio、Softgarden、Inspira（联合国）、各大学的招聘门户。
3. **长招聘公告**：联合国和开发银行的 ToR、海湾国家的项目招聘、德国公共部门的长公告。

能用深度研究（Deep Research）就用。Claude 已经覆盖的普通网页，不用重复去刷。

### 4.2 关键词（中英德混合搜）

- 德语：Grabungstechniker / Grabungstechnikerin、Grabungsleiter、Vermessung Archäologie、Photogrammetrie、Dokumentation Bodendenkmalpflege、Archäologische Fachfirma、wissenschaftliche:r Volontär:in。
- 技术：photogrammetry、structure from motion、3D documentation、heritage recording、drone / UAV survey、LiDAR、GIS archaeology、archaeological illustration。
- 国际：UNESCO、World Heritage advisory、ICOMOS、ICCROM、ALIPH、World Monuments Fund、heritage impact assessment、ESIA cultural heritage。
- 海湾：Gulf heritage、AlUla / RCU、Diriyah、Heritage Commission Saudi、DCT Abu Dhabi、Qatar Museums、Sharjah archaeology、museum education Gulf。
- 政策：Blaue Karte 门槛变化、Fachkräfteeinwanderung、意大利 / 欧盟居留和工作许可变化、无人机法规（EASA、ENAC）变化。

### 4.3 路线（写 `rel`、判断对不对口用）

路线 id 和 App 的 `data.js` 一致，列表写在【我的背景】里（不放进公开仓库）。`rel` 只能用那里列出的 id，或某条情报的 id。

### 4.4 必须写出来的信息

- **德语岗位必须带工资**：公告写了就照写（例如 `TV-L E9`、`TVöD E8`、月薪或年薪）；只写了工资档，就换算成大概的月薪税前。公告完全没写，`pay` 写“未写”，并在 `why` 里说一句按什么标准估计、估多少。和**蓝卡门槛**比一下，够不够要写出来。
- **欧盟境外的岗位必须写签证可行性**：按【我的背景】里的护照和居住地判断，写清楚这个岗位对她来说是：公告明确担保工签 / 公告明确只要本国或某国国籍 / 没写，要先问。没写的不要猜成“可以”。
- **硬门槛写进 `why`**：语言等级、学历、国籍或安全审查、工作年限、驾照。

### 4.5 质量规则

- **宁缺毋滥**：一天 3–8 条，没有合格的就发 0 条，`note` 里说一句。
- 截止日期离今天不到 3 天的不发，除非 imp 5，并在 `why` 里写清时间。
- 只看到聚合站转述、没打开原页或 PDF 的，不发。
- 待办 0–3 条，今天能动手，带截止日期。
- 不写她的个人数据：成绩、收入、证件号、住址。

---

## 5. 角色要求：情报要克制

GPT 的性格可以照常：热情、话多、少年气，推送里怎么说话由 GPT 自己决定。这份文档不替 GPT 定它的拟人选择。

但**情报本身**要守这几条：

- `why` 一句话，说她**为什么该投或不该投**，具体到哪一项经历对口、哪一个门槛卡人。不要只夸，不要鼓劲。不对口就直说不对口，并说为什么还值得看一眼（或者干脆不发）。
- 不迁就、不讨好：她喜欢的方向出现了坏消息（门槛涨了、岗位要本国国籍），照样发，照样写清楚。
- 不要把坏消息解释成“其实是好事”。门槛就是门槛。
- 没核实过的不写成事实。PDF 读不全、页面要登录看不到全文，就在 `why` 里说“没读到全文”。
- `imp` 按对口程度打，不按“看起来很厉害”打。

**交付前自查清单**

- [ ] `src` 是 `"gpt"`，文件里没有 `adj`。
- [ ] 所有 id 以 `gpt-` 开头，不重复；待办 id 是 `gpt-todo-YYYY-MM-DD-序号`。
- [ ] 没有 30 天以前的条目。
- [ ] 每条 `kind` 在七类里，`imp` 是 1–5 的整数，`why` 不为空。
- [ ] 有链接的 `key` 是规范化链接（或照抄 Claude 的 key）。
- [ ] 和 Claude 重复又没有新角度的，已经删掉。
- [ ] 德语岗有工资，欧盟境外岗有签证可行性。
- [ ] 是合法 JSON：双引号、没有结尾多余的逗号、没有注释。

---

## 6. 交付路径（闻神选一条）

### 6.1 路径 A：GPT 直接写进仓库

GPT 每天把完整的 `feed-gpt.json` 提交到 `wenshen111/career-feed` 的 `main` 分支，提交信息 `GPT 情报：YYYY-MM-DD`。只改这一个文件，不碰别的。

**授权步骤**

1. ChatGPT → 设置 → 连接器 / Apps（不同版本叫法不同）→ 找到 **GitHub** → 连接。
2. 跳到 GitHub 的授权页面时，选 **Only select repositories**，只勾 `wenshen111/career-feed`。权限要有 Contents 的读写（Read and write）。
3. 回到 ChatGPT，在普通对话里先试一次：“在 wenshen111/career-feed 里把 feed-gpt.json 的 note 改成 "测试"，提交到 main。” 去仓库看有没有这条提交。
4. 能提交，再把定时任务设成 A 段；然后把 note 改回来（第二天的正式运行会覆盖它）。

**要知道的风险**：2026 年 9–10 月有不少人反馈，ChatGPT **定时任务在无人值守时往 GitHub 等连接器写入会失败**（手动运行反而能成功），连续失败后定时任务还可能被自动停用。所以：

- 选 A 也要在提示词里留着 B 的兜底（A 段里已经写了：写入失败就在推送末尾附 JSON）。
- 每隔几天看一眼仓库的 `feed-gpt.json` 有没有更新，以及定时任务还在不在。

**校验**：每次提交，仓库的“校验情报文件”会自动跑。格式错了，GitHub 会显示红叉并给仓库主人发邮件；按邮件里的错误让 GPT 改。

### 6.2 路径 B：GPT 在推送末尾附 JSON，闻神手动粘贴

GPT 不需要 GitHub 权限。每天的回复是：

1. 推送正文（中文，三行以内）。
2. 空一行，一行固定标记：`=== feed-gpt.json ===`
3. **一个** ```` ```json ```` 代码块，里面是**完整的** `feed-gpt.json`（不是只有今天的新条目）。
4. 代码块后面不再写任何东西。

整个回复里只能有这一个 `json` 代码块，这样以后 App 的“收 GPT 日报”能直接提取（6.6 第 5 条）。

**闻神每天的动作**（App 的“收 GPT 日报”做好之前）

1. 在 ChatGPT 里点代码块右上角的“复制”。
2. 打开 `https://github.com/wenshen111/career-feed/edit/main/feed-gpt.json`（手机浏览器也行）。
3. 全选原内容，删掉，粘贴。
4. 点 **Commit changes**，提交信息写 `GPT 情报：YYYY-MM-DD`，选“直接提交到 main”，确认。
5. 过一两分钟看仓库页面：提交旁边是绿勾就好了；红叉就点进去看错误，把错误原文发给 GPT 让它重出一份。

App 做好“收 GPT 日报”以后，第 2–4 步换成在 App 里粘贴；但仓库里的文件最好还是照样更新，因为 Claude 每天要读它来去重。

---

## 7. 给 ChatGPT 的提示词（整段复制）

用法：**主提示词** + **A 段或 B 段**，按顺序粘进同一个定时任务。【我的背景】换成你自己的背景。

### 7.1 主提示词

```text
你每天为我（闻神）的职业养成 App 写一份情报文件 feed-gpt.json。完整规则在这份公开文档里，每次运行前先读：
https://raw.githubusercontent.com/wenshen111/career-feed/main/scripts/GPT%E6%AF%8F%E6%97%A5%E6%83%85%E6%8A%A5%E4%BB%BB%E5%8A%A1%E6%8C%87%E4%BB%A4.md
文档和这段提示词有冲突时，以这段提示词为准。

【我的背景】
（在这里粘贴你的背景。）

每次运行按顺序做：
1. 读 Claude 的情报：https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-claude.json
   读你自己上一版：https://raw.githubusercontent.com/wenshen111/career-feed/main/feed-gpt.json
   读不到 Claude 的文件，就在 note 里写一句“今天没读到 Claude 的文件，可能有重复”，不要假装去过重。
2. 搜今天的新机会。重点放在 Claude 读不到的地方：PDF 招聘公告和章程、需要登录或 JavaScript 的招聘系统（Workday、SuccessFactors、Personio、Softgarden、Inspira、大学招聘门户）、联合国和开发银行的长 ToR。能用深度研究就用。
   关键词包括 Grabungstechniker、Photogrammetrie / photogrammetry、3D documentation、drone / UAV survey、GIS archaeology、UNESCO、World Heritage advisory、ICOMOS、heritage impact assessment、Gulf heritage、AlUla、DCT Abu Dhabi、Qatar Museums、museum education、Blaue Karte 门槛变化、无人机法规变化。
3. 每一条都打开原页或 PDF 核实：标题、机构、地点、报酬、截止日期、语言、学历、国籍或签证、工作年限。只看到聚合站转述的不发。
4. 去重：Claude 发过的同一件事，你没有新角度就不发；有新角度就发，key 照抄 Claude 的，why 只写新角度。你自己 30 天内发过的不重发，条件变了就改原条目。
5. 必须写出来：德语岗位的工资（公告写了照写；只有工资档就换算成大概月薪；没写就写“未写”并给估计和依据），并和德国蓝卡门槛比一下。欧盟以外的岗位写签证可行性：公告明确担保 / 明确只要某国国籍 / 没写要先问，不要猜成可以。
6. 一天 3–8 条，宁缺毋滥；没有合格的就 0 条。截止不到 3 天的不发，除非 imp 5。待办 0–3 条，今天能动手、带截止日期。
7. 把今天的新内容加进你上一版的文件，删掉 found 或待办日期早于 30 天的，输出完整的 feed-gpt.json：
   - src 是 "gpt"；updated 写这次运行的时间，带时区（冬令时 +01:00，夏令时 +02:00）。
   - 绝对不要写 adj，连 "adj": {} 也不行。觉得某条路线的成功率该变，写进 note。
   - 情报 id：gpt-YYYY-MM-DD-简短英文；待办 id：gpt-todo-YYYY-MM-DD-序号。
   - key：有链接就写规范化链接（去掉 http(s)://、www.、结尾 /、# 后面、utm_* / fbclid / gclid 参数，全部小写）；没链接写“机构 + 标题”。
   - kind 只能是：工作、兼职、学校、联合国、资助、比赛、热点。imp 是 1–5 的整数。
   - 字段只能用：items 里 id key found kind title org loc pay deadline imp why link；todos 里 id key t due why rel。没有截止日期写 ""。
8. why 是你自己的看法，一句话，说我为什么该投或不该投：哪项经历对口、哪个门槛卡人。不要只夸，不要鼓劲，不要把坏消息解释成好事。没读到全文就直说。imp 按对口程度打，不按名气打。
9. 交付前按文档第 5 节的清单自查，确保是合法 JSON。

推送正文用中文，三行以内：今天几条、最值得看的一条、截止最近的是哪天。你怎么说话由你自己决定，但情报内容按上面的规矩写。
```

### 7.2 A 段（选路径 A 时接在主提示词后面）

```text
交付（路径 A）：
用 GitHub 连接器，把完整的 feed-gpt.json 提交到 wenshen111/career-feed 的 main 分支，提交信息“GPT 情报：YYYY-MM-DD”。只改 feed-gpt.json 这一个文件。
写入失败时不要说已经写好了：在推送正文里写“今天没写进仓库：（失败原因）”，然后按下面的格式在末尾附上完整文件，我会手动粘贴：
空一行，写一行 === feed-gpt.json ===，再接一个 json 代码块，里面是完整的 feed-gpt.json，代码块后面不再写任何东西。
```

### 7.3 B 段（选路径 B 时接在主提示词后面）

```text
交付（路径 B）：
不要尝试写 GitHub。回复分三部分，按顺序：
1. 推送正文（中文，三行以内）。
2. 空一行，写一行：=== feed-gpt.json ===
3. 一个 json 代码块，里面是完整的 feed-gpt.json（包括之前 30 天内的条目，不是只有今天的）。
整个回复只能有这一个 json 代码块，代码块后面不再写任何东西。
```

---

## 8. 第一次运行后对一遍

- 推送有没有到手机。
- A：仓库里 `feed-gpt.json` 有没有一条新提交，提交旁边是不是绿勾。
- B：回复末尾是不是只有一个 `json` 代码块；粘进仓库后是不是绿勾。
- 打开文件看三处：没有 `adj`；和 `feed-claude.json` 没有重复的同一件事（或者有，但 `why` 只写了新角度）；德语岗有工资、欧盟境外岗有签证说明。
- 看两三条 `why`：是不是说了该不该投、卡在哪，而不是只在夸。

## 9. 常见错误

| 校验器报的错 | 怎么改 |
| --- | --- |
| `$.adj: 只有 feed-claude.json 可以写 adj` | 删掉整个 `adj`，想说的写进 `note`。 |
| `id: 必须以 "gpt-" 开头` | 改 id 前缀，别抄 Claude 的 id（只抄 key）。 |
| `距离 updated … 已经 N 天` | 删掉 30 天以前的条目。 |
| `key 相同，同一个文件里不要发两次` | 两条合成一条。 |
| `不认识的字段 …` | 删掉第 2 节没有列出的字段。 |
| `读不出来或不是合法 JSON` | 多半是结尾多了逗号、用了中文引号，或代码块外的文字被一起粘了进去。 |
