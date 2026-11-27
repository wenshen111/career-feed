// 一个很小的 JSON Schema 检查器，只支持 schema/feed.schema.json 用到的那些关键字。
// 自己写而不是装 ajv：仓库零依赖，不需要 npm install，GitHub Actions 和本地都直接用 node 跑。

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // string / number / boolean / object
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

function checkFormat(v, format) {
  if (typeof v !== 'string') return true;
  if (format === 'date') return isValidDate(v);
  if (format === 'date-time') return DATETIME.test(v) && !Number.isNaN(Date.parse(v));
  if (format === 'date-or-empty') return v === '' || isValidDate(v);
  return true;
}

export function checkSchema(value, schema, root = schema, path = '$') {
  const errors = [];
  const err = msg => errors.push(`${path}: ${msg}`);

  if (schema.$ref) {
    const name = schema.$ref.replace('#/$defs/', '');
    return checkSchema(value, root.$defs[name], root, path);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(value, t))) {
      err(`类型应该是 ${types.join(' 或 ')}，实际是 ${typeOf(value)}`);
      return errors;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) err(`只能是 ${schema.enum.join(' / ')} 之一，实际是 ${JSON.stringify(value)}`);
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) err('不能为空');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err(`格式不对（要求匹配 ${schema.pattern}），实际是 ${JSON.stringify(value)}`);
    if (schema.format && !checkFormat(value, schema.format)) err(`不是合法的 ${schema.format}：${JSON.stringify(value)}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) err(`不能小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) err(`不能大于 ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...checkSchema(v, schema.items, root, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    for (const k of schema.required || []) if (!(k in value)) err(`缺少字段 ${k}`);
    const props = schema.properties || {};
    const pats = Object.entries(schema.patternProperties || {}).map(([p, s]) => [new RegExp(p), s]);
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) { errors.push(...checkSchema(v, props[k], root, `${path}.${k}`)); continue; }
      const pat = pats.find(([re]) => re.test(k));
      if (pat) { errors.push(...checkSchema(v, pat[1], root, `${path}.${k}`)); continue; }
      if (schema.additionalProperties === false) err(`不认识的字段 ${k}`);
    }
  }
  return errors;
}
