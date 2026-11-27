// 跨 feed 重复检查：读两份 feed，用 App 的合并规则（lib/merge.mjs）合一遍，
// 看源头去重有没有漏。只报告，永远不让 CI 失败。
//
//   node scripts/check_cross_feed_dupes.mjs
//
// 怎么分“漏了”和“正常”：
//   - 被合并、但几条的 key 不一样（靠链接或标题对上的）→ 源头去重漏了，输出 warning。
//   - 被合并、key 全都一样 → 6.6 第 1 条允许的“对方发过、我有新角度，沿用对方 key”，只输出 notice。
//   - 相似度在模糊区间、没自动合并的 → notice，App 会问“是同一件吗？”。

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeFeeds } from '../lib/merge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inCI = !!process.env.GITHUB_ACTIONS;
const esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

function emit(level, title, lines) {
  if (inCI) console.log(`::${level} title=${esc(title)}::${esc(lines.join('\n'))}`);
  else console.log(`[${level}] ${title}\n  ${lines.join('\n  ')}`);
}

function load(name) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } // 格式错由 validate.mjs 报
}

export function report(claude, gpt) {
  const out = mergeFeeds(claude, gpt, []);
  const all = new Map();
  for (const [src, f] of [['claude', claude], ['gpt', gpt]]) {
    for (const field of ['items', 'todos']) {
      for (const x of (f && Array.isArray(f[field]) ? f[field] : [])) all.set(x.id, { src, x });
    }
  }
  const label = id => {
    const r = all.get(id);
    if (!r) return id;
    return `${id}「${r.x.title || r.x.t || ''}」key=${r.x.key || '（空）'}`;
  };
  const norm = s => String(s || '').trim().toLowerCase();
  const leaks = [], intended = [];
  for (const m of out.merged) {
    const keys = new Set(m.ids.map(id => norm(all.get(id)?.x.key)));
    (keys.size === 1 && !keys.has('') ? intended : leaks).push(m);
  }
  const before = (claude?.items?.length || 0) + (gpt?.items?.length || 0);
  return { out, leaks, intended, label, before };
}

function main() {
  const claude = load('feed-claude.json'), gpt = load('feed-gpt.json');
  const { out, leaks, intended, label, before } = report(claude, gpt);
  const after = out.items.length;
  console.log(`情报：合并前 ${before} 条，合并后 ${after} 条；待办合并后 ${out.todos.length} 条；模糊配对 ${out.maybe.length} 对。`);

  // 情报合并前后少了的，都在 leaks 或 intended 里；只有 key 不一样的（真漏了）才发 warning。
  if (leaks.length) {
    const leakItems = leaks.filter(m => m.type === 'item').length;
    emit('warning', `源头去重漏了 ${leaks.length} 组（情报 ${leakItems}，待办 ${leaks.length - leakItems}）`,
      leaks.map(m => `${m.type === 'item' ? '情报' : '待办'}，按 ${m.reasons.join('/')} 对上：${m.ids.map(label).join('  ＋  ')}`));
  }
  if (intended.length) {
    emit('notice', `${intended.length} 组沿用了对方的 key（新角度，正常）`,
      intended.map(m => m.ids.map(label).join('  ＋  ')));
  }
  if (out.maybe.length) {
    emit('notice', `${out.maybe.length} 对“可能是同一件”，App 会问`,
      out.maybe.map(p => `${p.type === 'item' ? '情报' : '待办'} 相似度 ${p.score}：${label(p.a)}  ↔  ${label(p.b)}`));
  }
  if (!leaks.length && !intended.length && !out.maybe.length) console.log('两份 feed 之间没有重复。');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (e) { emit('warning', '跨 feed 重复检查自己出错了（不影响校验）', [String(e && e.stack || e)]); }
}
