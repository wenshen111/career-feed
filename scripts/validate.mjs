#!/usr/bin/env node
// 校验情报文件。用法：
//   node scripts/validate.mjs                      # 校验根目录的 feed-claude.json 和 feed-gpt.json
//   node scripts/validate.mjs 某个文件.json ...     # 校验指定文件（文件名里要带 claude 或 gpt）
// 有错误时退出码为 1（GitHub Actions 会显示红叉）；只有提醒时仍然通过。

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema, isValidDate } from './lib/schema.mjs';
import { normalizeLink } from './lib/dedupe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schema', 'feed.schema.json'), 'utf8'));

export const KEEP_DAYS = 30;

// 从文件名推断这个文件应该是谁写的。
export function expectedSrc(filename) {
  const name = basename(filename).toLowerCase();
  if (name.includes('claude')) return 'claude';
  if (name.includes('gpt')) return 'gpt';
  return null;
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function validateFeed(feed, filename) {
  const errors = checkSchema(feed, SCHEMA);
  const warnings = [];
  if (errors.length) return { errors, warnings }; // 结构都不对时，后面的规则没有意义

  const src = feed.src;
  const want = expectedSrc(filename);
  if (want && src !== want) errors.push(`$.src: ${basename(filename)} 里的 src 必须是 "${want}"，实际是 "${src}"`);

  // adj 只由 Claude 写（6.5）。
  if (src !== 'claude' && 'adj' in feed) {
    errors.push(`$.adj: 只有 feed-claude.json 可以写 adj。${src} 觉得成功率要变，请写在 note 里。`);
  }

  // 参考日期 = updated 里写的那一天（用文件自己的日期，不用“今天”，这样旧版本的文件结果不会随时间变）。
  const ref = feed.updated.slice(0, 10);

  const seenIds = new Set();
  const checkId = (id, path) => {
    if (seenIds.has(id)) errors.push(`${path}.id: id "${id}" 重复了`);
    seenIds.add(id);
  };
  const checkAge = (date, path, what) => {
    const age = daysBetween(date, ref);
    if (age > KEEP_DAYS) errors.push(`${path}: ${what} ${date} 距离 updated（${ref}）已经 ${age} 天，只保留最近 ${KEEP_DAYS} 天，请删掉`);
    if (age < -1) errors.push(`${path}: ${what} ${date} 比 updated（${ref}）还晚，日期写错了吧`);
  };

  const itemKeys = new Map();
  feed.items.forEach((it, i) => {
    const p = `$.items[${i}]`;
    if (!it.id.startsWith(`${src}-`)) errors.push(`${p}.id: 必须以 "${src}-" 开头，实际是 "${it.id}"`);
    checkId(it.id, p);
    checkAge(it.found, `${p}.found`, '发现日期');
    const k = it.key.trim().toLowerCase();
    if (itemKeys.has(k)) errors.push(`${p}.key: 和 items[${itemKeys.get(k)}] 是同一件事（key 相同），同一个文件里不要发两次`);
    else itemKeys.set(k, i);
    if (it.link && k !== normalizeLink(it.link)) {
      warnings.push(`${p}.key: 有链接时 key 一般用规范化的链接（"${normalizeLink(it.link)}"）。如果是沿用对方的 key，可以忽略这条提醒。`);
    }
    if (it.deadline && isValidDate(it.deadline) && it.deadline < ref) warnings.push(`${p}.deadline: ${it.deadline} 已经过期`);
  });

  const todoKeys = new Map();
  feed.todos.forEach((td, i) => {
    const p = `$.todos[${i}]`;
    const m = td.id.match(/^([a-z]+)-todo-(\d{4}-\d{2}-\d{2})-/);
    if (!m || m[1] !== src) errors.push(`${p}.id: 必须是 "${src}-todo-YYYY-MM-DD-序号" 的样子，实际是 "${td.id}"`);
    else if (!isValidDate(m[2])) errors.push(`${p}.id: 里面的日期 ${m[2]} 不存在`);
    else checkAge(m[2], `${p}.id`, '待办日期');
    checkId(td.id, p);
    const k = td.key.trim().toLowerCase();
    if (todoKeys.has(k)) errors.push(`${p}.key: 和 todos[${todoKeys.get(k)}] 是同一件待办（key 相同）`);
    else todoKeys.set(k, i);
  });

  return { errors, warnings };
}

export function validateFile(path) {
  let feed;
  try {
    feed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { errors: [`读不出来或不是合法 JSON：${e.message}`], warnings: [] };
  }
  return validateFeed(feed, path);
}

function main(argv) {
  const files = argv.length ? argv : ['feed-claude.json', 'feed-gpt.json'].map(f => join(ROOT, f));
  let failed = false;
  for (const f of files) {
    const { errors, warnings } = validateFile(f);
    const name = basename(f);
    if (errors.length) {
      failed = true;
      console.log(`✗ ${name}：${errors.length} 个错误`);
      errors.forEach(e => console.log(`  错误  ${e}`));
    } else {
      console.log(`✓ ${name}：格式正确`);
    }
    warnings.forEach(w => console.log(`  提醒  ${w}`));
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
