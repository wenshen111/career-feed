// 合并去重库：把 feed-claude.json 和 feed-gpt.json 合成 App 显示用的一个列表。
// 规则按《GPT说明》6.6 节第 2、3、4 条。“是不是同一件”的判断直接用 scripts/lib/dedupe.mjs，
// 和源头去重（update_feed_claude.mjs）共用一套标准，不另写一份。
//
// 纯 ES module，不依赖 Node 的任何模块：Node 20 和浏览器（Vite + 原生 JS）都能直接 import。
//
//   import { mergeFeeds, fingerprintOf } from './lib/merge.mjs';
//   const out = mergeFeeds(claudeFeed, gptFeed, processed);
//   out.items / out.todos   要显示的（已合并）
//   out.maybe              相似度在模糊区间的两两配对，App 在两张卡之间显示小链条图标问“是同一件吗？”
//   out.archived           命中“已处理指纹库”的，直接进档案柜
//   out.adj                只取 Claude 的（GPT 写了也不用）

import { normalizeLink, similarity, sameItem, sameTodo } from '../scripts/lib/dedupe.mjs';

export const IMP_MAX = 5;
export const MAYBE_MIN = 0.5;        // 模糊区间下限（6.6 第 4 条）
export const ITEM_SIM = 0.75;        // 情报自动合并的标题相似度（6.6 第 2 条）
export const TODO_SIM = 0.7;         // 待办自动合并的文字相似度（6.6 第 2 条）
const SRC_ORDER = ['claude', 'gpt'];

const isEmpty = v => v === undefined || v === null || v === '' ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const norm = s => String(s || '').trim().toLowerCase();
const uniq = arr => [...new Set(arr.filter(x => !isEmpty(x)))];

// “先到”的顺序：情报按 found，待办按 id 里的日期；同一天时 Claude 在前（这是一个选择：
// Claude 07:47 写、GPT 08:40 写，同一天通常是 Claude 先到）。
const itemDate = it => String(it.found || '');
const todoDate = td => (String(td.id || '').match(/-todo-(\d{4}-\d{2}-\d{2})-/) || [])[1] || '';

function collect(feeds, field, dateOf) {
  const rows = [];
  for (const [src, feed] of feeds) {
    const list = feed && Array.isArray(feed[field]) ? feed[field] : [];
    list.forEach((x, i) => { if (x && typeof x === 'object') rows.push({ src, x, i }); });
  }
  return rows.sort((a, b) =>
    dateOf(a.x).localeCompare(dateOf(b.x)) ||
    SRC_ORDER.indexOf(a.src) - SRC_ORDER.indexOf(b.src) ||
    a.i - b.i);
}

// 把一组“同一件”合成一条：其他字段以先到的为准，空的用后到的补上。
function build(group, type) {
  const out = {};
  for (const { x } of group) {
    for (const [k, v] of Object.entries(x)) if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
  }
  const first = group[0].x;
  out.id = first.id;                                        // 合并后的 id 用先到的那条，App 的处理状态挂在它上面
  out.ids = group.map(g => g.x.id);
  out.srcs = SRC_ORDER.filter(s => group.some(g => g.src === s));
  out.views = group.filter(g => !isEmpty(g.x.why)).map(g => ({ src: g.src, why: g.x.why }));
  if (type === 'item') {
    const imps = group.map(g => Number(g.x.imp)).filter(Number.isFinite);
    // +1 只在两个助手都发了时加：同一个助手自己重复发，不算“两边都觉得重要”。
    if (imps.length) out.imp = Math.min(IMP_MAX, Math.max(...imps) + (out.srcs.length > 1 ? 1 : 0));
  }
  return out;
}

// 给 CI 报告用：这组是因为什么被判成同一件的。
function reasonOf(a, b, type) {
  if (type === 'item') {
    const la = normalizeLink(a.link), lb = normalizeLink(b.link);
    if (la && la === lb) return 'link';
  }
  if (a.key && b.key && norm(a.key) === norm(b.key)) return 'key';
  return type === 'item' ? 'title' : 'text';
}

function mergeList(rows, type) {
  const same = type === 'item' ? sameItem : sameTodo;
  const groups = [];
  for (const row of rows) {
    const g = groups.find(grp => grp.some(m => same(m.x, row.x)));
    if (g) g.push(row); else groups.push([row]);
  }
  // 后来的一条可能同时连上两个组（A~C、B~C）：把这样的组并起来，结果不依赖输入顺序。
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (groups[i].some(a => groups[j].some(b => same(a.x, b.x)))) {
        groups[i].push(...groups.splice(j, 1)[0]);
        j = i;
      }
    }
  }
  for (const g of groups) g.sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
  return groups;
}

// ---------- 已处理指纹库 ----------

/**
 * 我处理过（收下 / 已出击 / 销毁）的一条，记成一个指纹。App 在处理时调用，存到本地。
 * @param {object} entry  mergeFeeds 输出的一条情报或待办
 * @param {'item'|'todo'} [type]
 */
export function fingerprintOf(entry, type) {
  const t = type || ('title' in entry || 'link' in entry ? 'item' : 'todo');
  const fp = {
    type: t,
    ids: uniq([entry.id, ...(entry.ids || [])]),
    keys: uniq([entry.key, ...(entry.keys || [])]).map(norm),
    titles: uniq([t === 'item' ? entry.title : entry.t, ...(entry.titles || [])]),
  };
  if (t === 'item') {
    fp.links = uniq([entry.link, ...(entry.links || [])]).map(normalizeLink).filter(Boolean);
    if (!isEmpty(entry.org)) fp.org = entry.org;
    if (!isEmpty(entry.deadline)) fp.deadline = entry.deadline;
  } else if (!isEmpty(entry.due)) fp.due = entry.due;
  return fp;
}

// 一条新来的是不是命中某个指纹：用和合并完全一样的判断，指纹里的每个链接 / key / 标题都试一遍。
function hitsFingerprint(x, fp, type) {
  if (!fp || (fp.type || 'item') !== type) return false;
  if ((fp.ids || []).includes(x.id)) return true;
  const keys = fp.keys || [], titles = fp.titles || [];
  if (type === 'item') {
    const probes = [
      ...(fp.links || []).map(link => ({ link })),
      ...keys.map(key => ({ key })),
      ...titles.map(title => ({ title, org: fp.org, deadline: fp.deadline })),
    ];
    return probes.some(p => sameItem(x, p));
  }
  return [...keys.map(key => ({ key })), ...titles.map(t => ({ t, due: fp.due }))].some(p => sameTodo(x, p));
}

// ---------- 模糊区间 ----------

function maybePairs(groups, type) {
  const hi = type === 'item' ? ITEM_SIM : TODO_SIM;
  const text = x => (type === 'item' ? x.title : x.t);
  const out = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const A = groups[i], B = groups[j];
      // 同一个助手自己发的两条不问：那是两件不同的事（比如同一机构的两个岗位），问了只是噪音。
      if (A.srcs.length === 1 && B.srcs.length === 1 && A.srcs[0] === B.srcs[0]) continue;
      const s = similarity(text(A), text(B));
      if (s >= MAYBE_MIN && s < hi) out.push({ type, a: A.id, b: B.id, score: Math.round(s * 100) / 100 });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

// ---------- 主入口 ----------

/**
 * 合并两份 feed。
 * @param {object|null} claude     feed-claude.json 的内容
 * @param {object|null} gpt        feed-gpt.json 的内容
 * @param {Array<object>} [processed]  已处理指纹库（fingerprintOf 的输出组成的数组）
 * @returns {{
 *   items: object[], todos: object[], maybe: object[], archived: object[],
 *   adj: object, notes: {src: string, note: string}[],
 *   merged: {type: string, ids: string[], srcs: string[], reasons: string[]}[]
 * }}
 */
export function mergeFeeds(claude, gpt, processed = []) {
  const feeds = [['claude', claude], ['gpt', gpt]];
  const fps = Array.isArray(processed) ? processed : [];
  const result = { items: [], todos: [], maybe: [], archived: [], merged: [] };

  for (const [type, field, dateOf] of [['item', 'items', itemDate], ['todo', 'todos', todoDate]]) {
    const groups = mergeList(collect(feeds, field, dateOf), type);
    const live = [];
    for (const g of groups) {
      const entry = build(g, type);
      if (g.length > 1) {
        const reasons = uniq(g.slice(1).map((m, k) => reasonOf(g[k].x, m.x, type)));
        result.merged.push({ type, ids: entry.ids, srcs: entry.srcs, reasons });
      }
      // 任何一条成员命中指纹，整组都进档案柜（合并后的这一条，App 只会处理过一次）。
      if (fps.some(fp => g.some(m => hitsFingerprint(m.x, fp, type)))) {
        result.archived.push({ ...entry, type });
      } else live.push(entry);
    }
    result[field] = live;
    result.maybe.push(...maybePairs(live, type));
  }

  // adj 只由 Claude 写（6.5），直接透传；GPT 文件里就算有也不用。
  result.adj = claude && claude.adj && typeof claude.adj === 'object' ? { ...claude.adj } : {};
  result.notes = feeds
    .filter(([, f]) => f && !isEmpty(f.note))
    .map(([src, f]) => ({ src, note: f.note }));
  return result;
}
