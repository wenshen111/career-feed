// 去重工具：按《GPT说明》6.6 节第 2 条的判断标准。
// App 端合并（保底去重）也应该用同样的规则，这样源头和 App 的判断一致。

// 规范化链接：去掉 http(s)://、www.、结尾斜杠、utm_ 等跟踪参数、#锚点，全部小写。
const TRACKING = /^(utm_[a-z0-9_]*|fbclid|gclid|mc_cid|mc_eid)$/i;

export function normalizeLink(link) {
  if (!link) return '';
  let s = String(link).trim();
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  const q = s.indexOf('?');
  let base = q >= 0 ? s.slice(0, q) : s;
  const query = q >= 0 ? s.slice(q + 1) : '';
  const kept = query
    .split('&')
    .filter(Boolean)
    .filter(p => !TRACKING.test(p.split('=')[0]));
  base = base.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  return (kept.length ? `${base}?${kept.join('&')}` : base).toLowerCase();
}

// 双字切分：原样复用 v4 app.js 里的 bigrams（英文/数字按整词，中文按相邻两字）。
export function bigrams(s) {
  s = String(s).toLowerCase();
  const out = new Set();
  for (const w of s.match(/[a-z0-9]+(?:[/-][a-z0-9]+)*/g) || []) out.add(w);
  const cj = s.replace(/[^一-鿿]/g, ' ');
  for (const seg of cj.split(/\s+/)) {
    for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
    if (seg.length === 1) out.add(seg);
  }
  return out;
}

// 相似度 = 共同的双字数 / 两边里较多的那个数。
// 用“较多的那边”做分母是一个选择：比用较少的那边严格，短标题不会因为被长标题包含就判成同一件。
export function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach(x => { if (B.has(x)) hit++; });
  return hit / Math.max(A.size, B.size);
}

const norm = s => String(s || '').trim().toLowerCase();
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

// 两条情报是不是“同一件事”（满足任一条）。
export function sameItem(a, b) {
  const la = normalizeLink(a.link), lb = normalizeLink(b.link);
  if (la && la === lb) return true;
  if (a.key && b.key && norm(a.key) === norm(b.key)) return true;
  if (a.org && b.org && norm(a.org) === norm(b.org) &&
      similarity(a.title, b.title) >= 0.75 &&
      (!a.deadline || !b.deadline || a.deadline === b.deadline)) return true;
  return false;
}

// 两条待办是不是同一件：key 相同，或文字相似度 ≥ 0.7 且截止日期相差不超过 3 天。
// 有一方没写截止日期时，按“相差不超过 3 天”处理（和情报那条“有一方为空”一致，这是一个选择）。
export function sameTodo(a, b) {
  if (a.key && b.key && norm(a.key) === norm(b.key)) return true;
  if (similarity(a.t, b.t) >= 0.7) {
    if (!a.due || !b.due) return true;
    return dayDiff(a.due, b.due) <= 3;
  }
  return false;
}
