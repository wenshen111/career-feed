import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeed } from '../scripts/validate.mjs';
import { normalizeLink, similarity, sameItem, sameTodo } from '../scripts/lib/dedupe.mjs';
import { mergeFeed, romeISO, romeDate } from '../scripts/update_feed_claude.mjs';

const base = src => ({ src, updated: '2026-11-26T07:47:00+01:00', items: [], todos: [], note: '' });
const item = (src, extra = {}) => ({
  id: `${src}-2026-11-26-unesco-intern`, key: 'unesco.org/careers/12345', found: '2026-11-26',
  kind: '联合国', title: 'UNESCO 文化遗产实习', org: 'UNESCO', imp: 4, why: '对口', link: 'https://www.unesco.org/careers/12345/', ...extra,
});
const ok = (feed, file) => assert.deepEqual(validateFeed(feed, file).errors, []);
const bad = (feed, file, re) => {
  const { errors } = validateFeed(feed, file);
  assert.ok(errors.some(e => re.test(e)), `应该报错 ${re}，实际：\n${errors.join('\n')}`);
};

// ---------- 校验 ----------

test('6.5 的示例能通过', () => {
  ok({ ...base('claude'), items: [item('claude')], todos: [{ id: 'claude-todo-2026-11-26-1', key: '给Marchetti发邮件问Karkemish', t: '发邮件', due: '2026-11-30', why: '…', rel: 'x' }], adj: { tech: 3 }, note: '早' }, 'feed-claude.json');
});

test('feed-gpt.json 里出现 adj 要拒绝', () => {
  bad({ ...base('gpt'), adj: { tech: 3 } }, 'feed-gpt.json', /只有 feed-claude\.json 可以写 adj/);
  bad({ ...base('gpt'), adj: {} }, 'feed-gpt.json', /adj/);
});

test('id 必须以自己的 src 开头', () => {
  bad({ ...base('gpt'), items: [item('claude')] }, 'feed-gpt.json', /必须以 "gpt-" 开头/);
  bad({ ...base('claude'), todos: [{ id: 'gpt-todo-2026-11-26-1', key: 'k', t: 't' }] }, 'feed-claude.json', /claude-todo/);
});

test('文件名和 src 要对得上', () => {
  bad(base('gpt'), 'feed-claude.json', /src 必须是 "claude"/);
});

test('超过 30 天的情报和待办要拒绝，30 天整可以', () => {
  ok({ ...base('claude'), items: [item('claude', { found: '2026-10-27' })] }, 'feed-claude.json');
  bad({ ...base('claude'), items: [item('claude', { found: '2026-10-26' })] }, 'feed-claude.json', /只保留最近 30 天/);
  bad({ ...base('claude'), todos: [{ id: 'claude-todo-2026-10-01-1', key: 'k', t: 't' }] }, 'feed-claude.json', /只保留最近 30 天/);
});

test('字段和类型', () => {
  bad({ ...base('claude'), items: [item('claude', { imp: 6 })] }, 'feed-claude.json', /不能大于 5/);
  bad({ ...base('claude'), items: [item('claude', { imp: '4' })] }, 'feed-claude.json', /类型应该是 integer/);
  bad({ ...base('claude'), items: [item('claude', { kind: '实习' })] }, 'feed-claude.json', /只能是/);
  bad({ ...base('claude'), items: [item('claude', { found: '2026-02-30' })] }, 'feed-claude.json', /不是合法的 date/);
  bad({ ...base('claude'), items: [item('claude', { titel: 'x' })] }, 'feed-claude.json', /不认识的字段 titel/);
  const { why, ...noWhy } = item('claude');
  bad({ ...base('claude'), items: [noWhy] }, 'feed-claude.json', /缺少字段 why/);
  bad({ ...base('claude'), updated: '2026-11-26 07:47' }, 'feed-claude.json', /date-time/);
  bad({ ...base('claude'), adj: { tech: 2.5 } }, 'feed-claude.json', /integer/);
});

test('同一个文件里 id、key 不能重复', () => {
  bad({ ...base('claude'), items: [item('claude'), item('claude')] }, 'feed-claude.json', /重复/);
  bad({ ...base('claude'), items: [item('claude'), item('claude', { id: 'claude-2026-11-26-b' })] }, 'feed-claude.json', /key 相同/);
});

test('截止日期可以为空', () => {
  ok({ ...base('claude'), items: [item('claude', { deadline: '' }), item('claude', { id: 'claude-x', key: 'b', link: undefined, deadline: null })].map(x => JSON.parse(JSON.stringify(x))) }, 'feed-claude.json');
});

// ---------- 去重 ----------

test('规范化链接', () => {
  assert.equal(normalizeLink('HTTPS://www.UNESCO.org/careers/12345/?utm_source=x&id=7#top'), 'unesco.org/careers/12345?id=7');
  assert.equal(normalizeLink('http://unesco.org/careers/12345'), 'unesco.org/careers/12345');
});

test('同一件事的三种判断', () => {
  const a = item('claude');
  assert.ok(sameItem(a, { title: '别的', link: 'http://unesco.org/careers/12345?utm_campaign=z' }), '链接相同');
  assert.ok(sameItem(a, { title: '别的', key: 'UNESCO.org/careers/12345' }), 'key 相同');
  assert.ok(sameItem({ org: 'UNESCO', title: 'UNESCO 文化遗产实习 2027', deadline: '' }, { org: 'unesco', title: 'UNESCO 文化遗产实习', deadline: '2026-12-15' }), '机构相同、标题相似');
  assert.ok(!sameItem({ org: 'UNESCO', title: '文化遗产实习', deadline: '2026-12-01' }, { org: 'UNESCO', title: '文化遗产实习', deadline: '2026-12-15' }), '截止日期不同不算');
  assert.ok(similarity('文化遗产实习', '自然遗产实习') < 0.75);
});

test('待办去重', () => {
  assert.ok(sameTodo({ key: 'a', t: '给Marchetti发邮件问Karkemish', due: '2026-11-30' }, { key: 'b', t: '给Marchetti发邮件问Karkemish', due: '2026-12-02' }));
  assert.ok(!sameTodo({ key: 'a', t: '给Marchetti发邮件问Karkemish', due: '2026-11-30' }, { key: 'b', t: '给Marchetti发邮件问Karkemish', due: '2026-12-10' }));
});

// ---------- 合并 ----------

const today = '2026-11-27';
const updated = '2026-11-27T07:47:00+01:00';
const ownEmpty = { ...base('claude'), adj: { tech: 3 } };

test('GPT 已发、没有新角度：不发', () => {
  const peer = { ...base('gpt'), items: [item('gpt')] };
  const { feed } = mergeFeed(ownEmpty, peer, { items: [item('claude', { id: undefined })] }, { today, updated });
  assert.equal(feed.items.length, 0);
});

test('GPT 已发、有新角度：沿用对方 key，why 只写新角度', () => {
  const peer = { ...base('gpt'), items: [item('gpt', { key: 'GPT 自己的 key' })] };
  const c = { ...item('claude'), id: undefined, newAngle: '隐藏门槛：要会意大利语 B2' };
  const { feed } = mergeFeed(ownEmpty, peer, { items: [c] }, { today, updated });
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].key, 'GPT 自己的 key');
  assert.equal(feed.items[0].why, '隐藏门槛：要会意大利语 B2');
  assert.ok(!('newAngle' in feed.items[0]));
  assert.ok(feed.items[0].id.startsWith('claude-2026-11-27-'));
  assert.deepEqual(validateFeed(feed, 'feed-claude.json').errors, []);
});

test('自己发过的不重发；超过 30 天的删掉；adj 保留', () => {
  const own = { ...ownEmpty, items: [item('claude', { found: '2026-11-20' }), item('claude', { id: 'claude-old', key: 'old', link: undefined, found: '2026-10-01' })] };
  const { feed } = mergeFeed(own, base('gpt'), { items: [{ ...item('claude'), id: undefined }] }, { today, updated });
  assert.deepEqual(feed.items.map(x => x.found), ['2026-11-20']);
  assert.deepEqual(feed.adj, { tech: 3 });
});

test('合并结果一定能通过校验（含待办编号）', () => {
  const cand = { items: [{ kind: '工作', title: '博物馆讲解员', org: 'MAMbo', imp: 3, why: '离家近' }], todos: [{ t: '更新简历' }, { t: '问导师推荐信' }], note: '今天降温' };
  const { feed } = mergeFeed(ownEmpty, base('gpt'), cand, { today, updated });
  assert.deepEqual(feed.todos.map(x => x.id), ['claude-todo-2026-11-27-1', 'claude-todo-2026-11-27-2']);
  assert.equal(feed.items[0].key, 'MAMbo 博物馆讲解员');
  assert.deepEqual(validateFeed(feed, 'feed-claude.json').errors, []);
});

test('意大利时间：冬令时 +01:00，夏令时 +02:00', () => {
  assert.equal(romeISO(new Date('2026-11-27T06:47:00Z')), '2026-11-27T07:47:00+01:00');
  assert.equal(romeISO(new Date('2026-07-01T05:47:00Z')), '2026-07-01T07:47:00+02:00');
  assert.equal(romeDate(new Date('2026-11-27T23:30:00Z')), '2026-11-28');
});

// ---------- 候选文件 ----------

import { readCandidates } from '../scripts/update_feed_claude.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('候选文件：正常读入；不认识的字段要报错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cand-'));
  const good = join(dir, 'good.json');
  writeFileSync(good, JSON.stringify({ items: [{ kind: '工作', title: 't', imp: 3, why: 'w' }], note: 'n' }));
  const c = readCandidates(good);
  assert.equal(c.items.length, 1);
  assert.deepEqual(c.todos, []);
  assert.equal(c.note, 'n');
  assert.equal(c.adj, undefined);
  const badf = join(dir, 'bad.json');
  writeFileSync(badf, JSON.stringify({ itmes: [] }));
  assert.throws(() => readCandidates(badf), /不认识的字段 itmes/);
  assert.deepEqual(readCandidates(null), { items: [], todos: [] });
});
