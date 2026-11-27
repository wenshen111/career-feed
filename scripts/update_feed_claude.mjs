#!/usr/bin/env node
// Claude 每日更新 feed-claude.json 的脚手架。
//
// 流程（《GPT说明》6.5、6.6 第 1 条）：
//   1. 读自己的 feed-claude.json，删掉超过 30 天的情报和待办
//   2. 读对方的 feed-gpt.json（源头去重）
//   3. 拿到今天的新候选（现在是空实现；真正的抓取以后接在 collectCandidates 里）
//   4. 逐条去重：自己发过的不重发；GPT 发过的，没有新角度就不发，有新角度就沿用对方的 key、why 只写新角度
//   5. 合并追加，更新 updated 和 note，先校验，校验通过才写回文件
//
// 用法：
//   node scripts/update_feed_claude.mjs              # 正常运行
//   node scripts/update_feed_claude.mjs --dry-run    # 只打印结果，不写文件
//   PIPELINE_CHECK=1 node scripts/update_feed_claude.mjs   # 加一条“管线测试”占位情报（证明端到端能跑）
//   PEER_FEED_URL=https://... node scripts/...       # 从网上读对方文件，默认读同目录下的 feed-gpt.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLink, sameItem, sameTodo } from './lib/dedupe.mjs';
import { validateFeed, KEEP_DAYS } from './validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'claude';
const OWN_FILE = join(ROOT, 'feed-claude.json');
const PEER_FILE = join(ROOT, 'feed-gpt.json');
const TZ = 'Europe/Rome';

// ---------- 时间：情报按意大利时间记日期 ----------

function romeParts(now) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(f.formatToParts(now).map(p => [p.type, p.value]));
}

export function romeDate(now = new Date()) {
  const p = romeParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

export function romeISO(now = new Date()) {
  const p = romeParts(now);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((local - Math.floor(now.getTime() / 1000) * 1000) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ---------- 读文件 ----------

function emptyFeed(src) {
  return { src, updated: romeISO(), items: [], todos: [], ...(src === 'claude' ? { adj: {} } : {}), note: '' };
}

function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function loadPeer() {
  const url = process.env.PEER_FEED_URL;
  if (url) {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (res.status === 404) return emptyFeed('gpt');
    if (!res.ok) throw new Error(`读取对方文件失败：HTTP ${res.status}`);
    return res.json();
  }
  return readJSON(PEER_FILE, emptyFeed('gpt'));
}

// ---------- 候选：真正的情报抓取以后写在这里 ----------

// 返回 { items: [...], todos: [...], adj?: {...}, note?: '...' }
// 每个候选 item 的写法和 6.5 一样，可以不写 id（会自动生成），可以多一个 newAngle 字段：
// 当它和 GPT 已发的某条是同一件事时，newAngle 就是“新角度”那一句；没有 newAngle 就不发。
export async function collectCandidates({ today }) {
  const items = [];
  if (process.env.PIPELINE_CHECK === '1') {
    const link = 'https://github.com/wenshen111/career-feed';
    items.push({
      kind: '热点',
      title: '管线测试：这一条不是真情报',
      org: 'career-feed',
      imp: 1,
      why: '证明每日任务能读对方文件、去重、写入并提交回仓库。真正的抓取接上后删掉这条。',
      link,
      key: normalizeLink(link),
      found: today,
    });
  }
  return { items, todos: [], note: '' };
}

// ---------- 合并 ----------

function slug(s) {
  const ascii = normalizeLink(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (ascii || 'item').slice(0, 40).replace(/-+$/, '');
}

function uniqueId(base, used) {
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

const todoDate = td => (td.id.match(/-todo-(\d{4}-\d{2}-\d{2})-/) || [])[1];

export function mergeFeed(own, peer, cand, { today, updated }) {
  const cutoff = addDays(today, -KEEP_DAYS);
  const log = [];

  const items = own.items.filter(it => it.found >= cutoff);
  const todos = own.todos.filter(td => (todoDate(td) || today) >= cutoff);
  const pruned = own.items.length - items.length + own.todos.length - todos.length;
  if (pruned) log.push(`删掉超过 ${KEEP_DAYS} 天的 ${pruned} 条`);

  const used = new Set([...items, ...todos].map(x => x.id));

  for (const c of cand.items || []) {
    const { newAngle, ...it } = c;
    it.found = it.found || today;
    if (!it.key) it.key = it.link ? normalizeLink(it.link) : `${it.org || ''} ${it.title}`.trim();
    if (items.some(x => sameItem(x, it))) { log.push(`跳过（自己发过）：${it.title}`); continue; }
    const hit = (peer.items || []).find(x => sameItem(x, it));
    if (hit) {
      if (!newAngle) { log.push(`跳过（GPT 已发，没有新角度）：${it.title}`); continue; }
      it.key = hit.key;
      it.why = newAngle;
      log.push(`沿用 GPT 的 key，只写新角度：${it.title}`);
    }
    it.id = it.id && it.id.startsWith(`${SRC}-`) ? uniqueId(it.id, used) : uniqueId(`${SRC}-${today}-${slug(it.link || it.title)}`, used);
    items.push({ id: it.id, ...it });
    log.push(`新增情报：${it.title}`);
  }

  let n = todos.filter(td => todoDate(td) === today).length;
  for (const c of cand.todos || []) {
    const { newAngle, ...td } = c;
    if (!td.key) td.key = td.t;
    if (todos.some(x => sameTodo(x, td))) { log.push(`跳过待办（自己发过）：${td.t}`); continue; }
    const hit = (peer.todos || []).find(x => sameTodo(x, td));
    if (hit) {
      if (!newAngle) { log.push(`跳过待办（GPT 已发，没有新角度）：${td.t}`); continue; }
      td.key = hit.key;
      td.why = newAngle;
    }
    td.id = uniqueId(`${SRC}-todo-${today}-${++n}`, used);
    todos.push({ id: td.id, ...td });
    log.push(`新增待办：${td.t}`);
  }

  const out = {
    src: SRC,
    updated,
    items,
    todos,
    adj: cand.adj ?? own.adj ?? {},
    note: cand.note ?? '',
  };
  return { feed: out, log };
}

// ---------- 主程序 ----------

async function main() {
  const dry = process.argv.includes('--dry-run');
  const now = new Date();
  const today = romeDate(now);
  const own = readJSON(OWN_FILE, emptyFeed(SRC));
  const peer = await loadPeer();
  const cand = await collectCandidates({ today, own, peer });
  const { feed, log } = mergeFeed(own, peer, cand, { today, updated: romeISO(now) });

  const { errors, warnings } = validateFeed(feed, OWN_FILE);
  log.forEach(l => console.log(`· ${l}`));
  warnings.forEach(w => console.log(`  提醒  ${w}`));
  if (errors.length) {
    errors.forEach(e => console.log(`  错误  ${e}`));
    console.log('✗ 新文件没通过校验，没有写入。');
    process.exit(1);
  }
  const text = `${JSON.stringify(feed, null, 2)}\n`;
  if (dry) { console.log(text); return; }
  writeFileSync(OWN_FILE, text);
  console.log(`✓ 已写入 feed-claude.json：${feed.items.length} 条情报，${feed.todos.length} 条待办`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e); process.exit(1); });
}
