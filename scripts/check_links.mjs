#!/usr/bin/env node
// 检查情报里的链接还能不能打开。只提醒，不拦。
// 用法：node scripts/check_links.mjs [文件...]   默认检查 feed-claude.json；也可以传候选文件。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (!files.length) files.push(join(ROOT, 'feed-claude.json'));

async function probe(url) {
  const opts = { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (career-feed link check)' } };
  try {
    let r = await fetch(url, { ...opts, method: 'HEAD' });
    if (r.status === 405 || r.status === 403 || r.status === 400) r = await fetch(url, { ...opts, method: 'GET' });
    return r.status;
  } catch (e) {
    return `打不开（${e.cause?.code || e.name}）`;
  }
}

let bad = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const it of data.items || []) {
    if (!it.link) continue;
    const s = await probe(it.link);
    const ok = typeof s === 'number' && s < 400;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '?'} ${s}  ${it.title}  ${it.link}`);
  }
}
if (bad) console.log(`\n${bad} 个链接可能有问题。有的网站会拒绝自动访问（403），需要人工点开确认。`);
