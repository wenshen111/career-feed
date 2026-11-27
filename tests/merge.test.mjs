import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFeeds, fingerprintOf } from '../lib/merge.mjs';

const feed = (src, items = [], todos = [], extra = {}) =>
  ({ src, updated: '2026-11-27T08:00:00+01:00', items, todos, note: '', ...extra });
const item = (src, slug, extra = {}) => ({
  id: `${src}-2026-11-27-${slug}`, key: `example.org/${slug}`, found: '2026-11-27', kind: '工作',
  title: slug, org: 'Org', imp: 3, why: `${src} 的角度`, link: `https://example.org/${slug}`, ...extra,
});
const todo = (src, n, t, extra = {}) =>
  ({ id: `${src}-todo-2026-11-27-${n}`, key: t, t, due: '2026-12-01', why: `${src} 的理由`, ...extra });

// ---------- 情报 ----------

test('完全不同的两条：合并后还是两条，各自一个来源', () => {
  const out = mergeFeeds(
    feed('claude', [item('claude', 'unesco', { title: 'UNESCO 文化部门实习', org: 'UNESCO' })]),
    feed('gpt', [item('gpt', 'agora', { title: 'Athenian Agora 发掘志愿项目', org: 'ASCSA' })]),
  );
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.items.map(x => x.srcs), [['claude'], ['gpt']]);
  assert.deepEqual(out.merged, []);
  assert.deepEqual(out.maybe, []);
});

test('同链接去重：http/www/结尾斜杠/utm 不同也算同一件', () => {
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { key: 'k-claude', link: 'https://www.Example.org/job/1/?utm_source=x' })]),
    feed('gpt', [item('gpt', 'b', { key: 'k-gpt', title: '完全不同的标题', link: 'http://example.org/job/1' })]),
  );
  assert.equal(out.items.length, 1);
  const [m] = out.items;
  assert.deepEqual(m.srcs, ['claude', 'gpt']);
  assert.deepEqual(m.ids, ['claude-2026-11-27-a', 'gpt-2026-11-27-b']);
  assert.deepEqual(m.views, [{ src: 'claude', why: 'claude 的角度' }, { src: 'gpt', why: 'gpt 的角度' }]);
  assert.deepEqual(out.merged, [{ type: 'item', ids: m.ids, srcs: ['claude', 'gpt'], reasons: ['link'] }]);
});

test('同 key 去重', () => {
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { key: 'unesco.org/careers/1', link: '' })]),
    feed('gpt', [item('gpt', 'b', { key: 'UNESCO.org/careers/1', link: '', title: '别的说法' })]),
  );
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.merged[0].reasons, ['key']);
});

test('同机构 + 相似标题（≥0.75）去重；截止日一方为空也算', () => {
  const title = 'Grabungstechniker Archäologie Köln Bonn 发掘技术员';
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { title, org: 'AbisZ', deadline: '' })]),
    feed('gpt', [item('gpt', 'b', { title: `${title}！`, org: 'abisz ', deadline: '2026-12-31' })]),
  );
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.merged[0].reasons, ['title']);
  assert.equal(out.items[0].deadline, '2026-12-31', '空的截止日用后到的补上');
});

test('机构相同、标题相似，但截止日不同：不合并', () => {
  const t = 'UNESCO 文化部门实习 世界遗产';
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { title: t, deadline: '2026-12-01' })]),
    feed('gpt', [item('gpt', 'b', { title: t, deadline: '2026-12-31' })]),
  );
  assert.equal(out.items.length, 2);
});

test('相似度在 0.5–0.75 之间：不合并，进 maybe', () => {
  // 两边各 6 个双字，共有 3 个（文化、化遗、遗产）→ 0.5，正好在下限
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { title: '文化遗产实习生' })]),
    feed('gpt', [item('gpt', 'b', { title: '文化遗产研究员' })]),
  );
  assert.equal(out.items.length, 2);
  assert.equal(out.maybe.length, 1);
  assert.deepEqual(out.maybe[0], { type: 'item', a: 'claude-2026-11-27-a', b: 'gpt-2026-11-27-b', score: 0.5 });
});

test('同一个助手自己的两条相似情报不进 maybe', () => {
  const out = mergeFeeds(
    feed('claude', [item('claude', 'a', { title: '文化遗产实习生' }), item('claude', 'b', { title: '文化遗产研究员' })]),
    feed('gpt'),
  );
  assert.deepEqual(out.maybe, []);
});

test('imp 取较大的再 +1，上限 5', () => {
  const pair = (ia, ib) => mergeFeeds(
    feed('claude', [item('claude', 'x', { imp: ia })]),
    feed('gpt', [item('gpt', 'x', { imp: ib })]),
  ).items[0].imp;
  assert.equal(pair(2, 3), 4);
  assert.equal(pair(4, 3), 5);
  assert.equal(pair(5, 5), 5);
  // 没合并的不加
  assert.equal(mergeFeeds(feed('claude', [item('claude', 'x', { imp: 3 })]), feed('gpt')).items[0].imp, 3);
});

test('其他字段以先到的为准：found 早的先到，同一天 Claude 先', () => {
  const out = mergeFeeds(
    feed('claude', [item('claude', 'x', { found: '2026-11-27', loc: '巴黎', pay: '' })]),
    feed('gpt', [item('gpt', 'x', { found: '2026-11-26', loc: '巴黎总部', pay: '无报酬' })]),
  );
  const [m] = out.items;
  assert.equal(m.id, 'gpt-2026-11-27-x', 'GPT 早一天发现，它先到');
  assert.equal(m.loc, '巴黎总部');
  assert.equal(m.pay, '无报酬');
  assert.deepEqual(m.srcs, ['claude', 'gpt'], 'srcs 固定按 claude、gpt 排');

  const same = mergeFeeds(feed('claude', [item('claude', 'x', { loc: 'A' })]), feed('gpt', [item('gpt', 'x', { loc: 'B' })]));
  assert.equal(same.items[0].loc, 'A');
});

test('三条连成一串（A~C、B~C）合成一条，和输入顺序无关', () => {
  const a = item('claude', 'a', { key: 'k1', link: 'https://x.org/1' });
  const b = item('gpt', 'b', { key: 'k2', link: 'https://x.org/2' });
  const c = item('gpt', 'c', { key: 'k1', link: 'https://x.org/2' });
  for (const gptItems of [[b, c], [c, b]]) {
    const out = mergeFeeds(feed('claude', [a]), feed('gpt', gptItems));
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].ids.length, 3);
  }
});

// ---------- 已处理指纹库 ----------

test('已处理指纹：命中的直接进档案柜，不再冒出来', () => {
  const first = mergeFeeds(feed('claude', [item('claude', 'unesco', { title: 'UNESCO 文化部门实习', org: 'UNESCO' })]), feed('gpt'));
  const fp = fingerprintOf(first.items[0]);

  // 第二天 GPT 用另一个链接、另一个 key 发了同一件
  const out = mergeFeeds(
    feed('claude', [item('claude', 'new', { title: '全新的一条', org: 'Other' })]),
    feed('gpt', [item('gpt', 'u2', { title: 'UNESCO 文化部门实习', org: 'unesco', key: 'other-key', link: 'https://other.org/x' })]),
    [fp],
  );
  assert.deepEqual(out.items.map(x => x.id), ['claude-2026-11-27-new']);
  assert.deepEqual(out.archived.map(x => x.id), ['gpt-2026-11-27-u2']);
});

test('已处理指纹：合并组里只要一条命中，整组归档', () => {
  const fp = { type: 'item', ids: [], keys: [], titles: [], links: ['example.org/x'] };
  const out = mergeFeeds(
    feed('claude', [item('claude', 'x', { link: 'https://example.org/x' })]),
    feed('gpt', [item('gpt', 'y', { key: 'example.org/x', link: 'https://mirror.org/y' })]),
    [fp],
  );
  assert.equal(out.items.length, 0);
  assert.equal(out.archived.length, 1);
  assert.deepEqual(out.archived[0].srcs, ['claude', 'gpt']);
});

test('已处理指纹：待办用待办的规则（key，或文字相似 + 截止日差 ≤3 天）', () => {
  const fp = fingerprintOf({ id: 'claude-todo-2026-11-20-1', key: '给Marchetti发邮件问Karkemish', t: '给Marchetti发邮件问Karkemish', due: '2026-11-30' });
  assert.equal(fp.type, 'todo');
  const out = mergeFeeds(feed('claude'), feed('gpt', [], [
    todo('gpt', 1, '给Marchetti发邮件问Karkemish', { key: '别的key', due: '2026-12-02' }),
    todo('gpt', 2, '给Marchetti发邮件问Karkemish', { key: '再别的', due: '2026-12-10' }),
  ]), [fp]);
  assert.deepEqual(out.archived.map(x => x.id), ['gpt-todo-2026-11-27-1']);
  assert.deepEqual(out.todos.map(x => x.id), ['gpt-todo-2026-11-27-2']);
});

// ---------- 待办 ----------

test('待办：key 相同合并；文字相似但截止日差 >3 天不合并', () => {
  const t = '核对Agora六周档期并决定是否准备两封推荐信';
  const out = mergeFeeds(
    feed('claude', [], [todo('claude', 1, t, { key: 'agora', due: '2026-11-30' }), todo('claude', 2, '算UNESCO实习的花销', { due: '2026-12-20' })]),
    feed('gpt', [], [todo('gpt', 1, '决定Agora要不要投', { key: 'Agora', due: '' }), todo('gpt', 2, t, { key: 'x', due: '2026-12-10' })]),
  );
  assert.equal(out.todos.length, 3);
  const agora = out.todos.find(x => x.key === 'agora');
  assert.deepEqual(agora.srcs, ['claude', 'gpt']);
  assert.equal(agora.views.length, 2);
  assert.equal('imp' in agora, false, '待办没有 imp');
});

test('待办：文字相似 ≥0.7 且截止日差 ≤3 天合并', () => {
  const t = '核对Agora六周档期并决定是否准备两封推荐信';
  const out = mergeFeeds(
    feed('claude', [], [todo('claude', 1, t, { key: 'a', due: '2026-11-30' })]),
    feed('gpt', [], [todo('gpt', 1, `${t}。`, { key: 'b', due: '2026-12-03' })]),
  );
  assert.equal(out.todos.length, 1);
  assert.deepEqual(out.merged, [{ type: 'todo', ids: ['claude-todo-2026-11-27-1', 'gpt-todo-2026-11-27-1'], srcs: ['claude', 'gpt'], reasons: ['text'] }]);
});

// ---------- adj 和边界 ----------

test('adj 只透传 Claude 的，GPT 的不参与', () => {
  const out = mergeFeeds(feed('claude', [], [], { adj: { tech: 3 } }), feed('gpt', [], [], { adj: { tech: -9, un: 5 } }));
  assert.deepEqual(out.adj, { tech: 3 });
  assert.deepEqual(mergeFeeds(feed('claude'), feed('gpt', [], [], { adj: { un: 5 } })).adj, {});
});

test('一份 feed 缺失或为空也能跑', () => {
  const out = mergeFeeds(null, feed('gpt', [item('gpt', 'x')]));
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.adj, {});
  assert.deepEqual(mergeFeeds(undefined, undefined).items, []);
});

test('不改动传进来的 feed', () => {
  const c = feed('claude', [item('claude', 'x')]), g = feed('gpt', [item('gpt', 'x')]);
  const before = JSON.stringify([c, g]);
  mergeFeeds(c, g);
  assert.equal(JSON.stringify([c, g]), before);
});

// ---------- CI 检查脚本 ----------

test('跨 feed 检查：key 不同却被合并算漏网，key 相同算有意沿用', async () => {
  const { report } = await import('../scripts/check_cross_feed_dupes.mjs');
  const r = report(
    feed('claude', [item('claude', 'a', { key: 'k1', link: 'https://x.org/1' }), item('claude', 'b', { key: 'shared', link: '' })]),
    feed('gpt', [item('gpt', 'a', { key: 'k2', link: 'https://www.x.org/1/' }), item('gpt', 'b', { key: 'shared', link: '', title: '新角度' })]),
  );
  assert.equal(r.before, 4);
  assert.equal(r.out.items.length, 2);
  assert.deepEqual(r.leaks.map(m => m.ids), [['claude-2026-11-27-a', 'gpt-2026-11-27-a']]);
  assert.deepEqual(r.intended.map(m => m.ids), [['claude-2026-11-27-b', 'gpt-2026-11-27-b']]);
});
