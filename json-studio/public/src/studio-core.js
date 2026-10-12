import { JsonCore } from './json-core.js';

export const StudioCore = (() => {
  const pathKey = (path, key) =>
    path + '[' + (typeof key === 'number' ? key : JSON.stringify(key)) + ']';
  const children = (ref) =>
    (ref.node.children || []).map((entry, index) => ({
      node: entry.node,
      path: pathKey(ref.path, ref.node.type === 'object' ? entry.key : index),
      indices: [...ref.indices, index],
    }));
  const rootRef = (node) => ({ node, path: '$', indices: [] });
  function decimal(raw) {
    const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    let digits = (match[2] + (match[3] || '')).replace(/^0+/, '');
    if (!digits) return { sign: 0, digits: '0', exponent: 0n };
    let exponent = BigInt(match[4] || '0') - BigInt((match[3] || '').length);
    const trailing = digits.match(/0+$/)?.[0].length || 0;
    if (trailing) {
      digits = digits.slice(0, -trailing);
      exponent += BigInt(trailing);
    }
    return { sign: match[1] ? -1 : 1, digits, exponent };
  }
  function compareNumbers(a, b) {
    const x = decimal(a),
      y = decimal(b);
    if (x.sign !== y.sign) return x.sign < y.sign ? -1 : 1;
    if (!x.sign) return 0;
    const xe = BigInt(x.digits.length) + x.exponent,
      ye = BigInt(y.digits.length) + y.exponent;
    if (xe !== ye) return (xe < ye ? -1 : 1) * x.sign;
    const width = Math.max(x.digits.length, y.digits.length),
      xd = x.digits.padEnd(width, '0'),
      yd = y.digits.padEnd(width, '0');
    return (xd === yd ? 0 : xd < yd ? -1 : 1) * x.sign;
  }
  function signature(node) {
    if (node.type === 'number') {
      const d = decimal(node.raw);
      return 'n:' + d.sign + ':' + d.digits + ':' + d.exponent;
    }
    if (!node.children) return node.type + ':' + JsonCore.primitive(node);
    const entries = node.children.map(
      (entry) =>
        (node.type === 'object' ? JSON.stringify(entry.key) + ':' : '') + signature(entry.node),
    );
    if (node.type === 'object') entries.sort();
    return node.type + '[' + entries.join(',') + ']';
  }
  function same(a, b) {
    return Boolean(a && b && signature(a) === signature(b));
  }
  function diff(before, after, ignoreOrder = true) {
    const changes = [];
    const push = (kind, a, b, path) => changes.push({ kind, path, before: a, after: b });
    function walk(a, b, path) {
      if (!a) {
        push('added', a, b, path);
        return;
      }
      if (!b) {
        push('removed', a, b, path);
        return;
      }
      if (a.type !== b.type) {
        push('modified', a, b, path);
        return;
      }
      if (!a.children) {
        if (!same(a, b)) push('modified', a, b, path);
        return;
      }
      if (a.type === 'array') {
        for (let i = 0; i < Math.max(a.children.length, b.children.length); i++)
          walk(a.children[i]?.node, b.children[i]?.node, pathKey(path, i));
        return;
      }
      const right = new Map(),
        used = new Map();
      b.children.forEach((entry) => {
        if (!right.has(entry.key)) right.set(entry.key, []);
        right.get(entry.key).push(entry.node);
      });
      a.children.forEach((entry) => {
        const index = used.get(entry.key) || 0;
        used.set(entry.key, index + 1);
        walk(entry.node, right.get(entry.key)?.[index], pathKey(path, entry.key));
      });
      const occurrences = new Map();
      b.children.forEach((entry) => {
        const index = occurrences.get(entry.key) || 0;
        occurrences.set(entry.key, index + 1);
        if (index >= (used.get(entry.key) || 0))
          walk(undefined, entry.node, pathKey(path, entry.key));
      });
      const keysA = a.children.map((e) => e.key),
        keysB = b.children.map((e) => e.key);
      if (
        !ignoreOrder &&
        JSON.stringify(keysA) !== JSON.stringify(keysB) &&
        JSON.stringify([...keysA].sort()) === JSON.stringify([...keysB].sort())
      )
        push('reordered', a, b, path);
    }
    walk(before, after, '$');
    return changes;
  }
  function getNode(root, indices) {
    let node = root;
    for (const index of indices) {
      node = node.children?.[index]?.node;
      if (!node) throw Error('This node no longer exists.');
    }
    return node;
  }
  function modify(root, indices, action, payload = {}) {
    const replace = (node, depth) => {
      if (depth < indices.length) {
        const index = indices[depth];
        if (!node.children?.[index]) throw Error('This node no longer exists.');
        return {
          ...node,
          children: node.children.map((entry, i) =>
            i === index ? { ...entry, node: replace(entry.node, depth + 1) } : entry,
          ),
        };
      }
      if (action === 'replace') return JsonCore.parse(payload.value).root;
      if (action === 'decode') {
        if (node.type !== 'string') throw Error('Select a JSON string.');
        return JsonCore.parse(node.value).root;
      }
      if (action === 'encode') return { type: 'string', value: JsonCore.stringify(node, '') };
      if (action === 'add') {
        if (!node.children) throw Error('Select an object or array to add a child.');
        const entry = { node: JsonCore.parse(payload.value).root },
          next = [...node.children];
        if (node.type === 'object') {
          if (next.some((e) => e.key === payload.key)) throw Error('This key already exists.');
          entry.key = payload.key;
          next.push(entry);
        } else {
          const at = payload.index === undefined ? next.length : Number(payload.index);
          if (!Number.isInteger(at) || at < 0 || at > next.length)
            throw Error('Array position is out of range.');
          next.splice(at, 0, entry);
        }
        return { ...node, children: next };
      }
      throw Error('Unknown edit action.');
    };
    if (action === 'rename' || action === 'remove') {
      if (!indices.length) throw Error('The root cannot be renamed or removed.');
      const parentIndices = indices.slice(0, -1),
        index = indices.at(-1),
        parent = getNode(root, parentIndices);
      let next = parent.children.filter((_, i) => action !== 'remove' || i !== index);
      if (action === 'rename') {
        if (parent.type !== 'object') throw Error('Array indices cannot be renamed.');
        if (parent.children.some((entry, i) => i !== index && entry.key === payload.key))
          throw Error('This key already exists.');
        next = next.map((entry, i) => (i === index ? { ...entry, key: payload.key } : entry));
      }
      const patch = (node, depth) =>
        depth === parentIndices.length
          ? { ...node, children: next }
          : {
              ...node,
              children: node.children.map((entry, i) =>
                i === parentIndices[depth]
                  ? { ...entry, node: patch(entry.node, depth + 1) }
                  : entry,
              ),
            };
      return patch(root, 0);
    }
    return replace(root, 0);
  }
  function query(root, expression) {
    if (expression.length > 2048) throw Error('JSONPath is limited to 2,048 characters.');
    let pos = 0,
      budget = 250000;
    const fail = (message) => {
      throw Error(message + ' at character ' + (pos + 1) + '.');
    };
    const spend = () => {
      if (--budget < 0) throw Error('Query is too broad. Use a more specific path.');
    };
    const white = () => {
      while (/\s/.test(expression[pos] || '') && pos < expression.length) pos++;
    };
    function quoted() {
      const quote = expression[pos++];
      let text = '';
      while (pos < expression.length) {
        const char = expression[pos++];
        if (char === quote) return text;
        if (char === '\\') {
          const next = expression[pos++];
          if (next === 'u') {
            const hex = expression.slice(pos, pos + 4);
            if (!/^[a-fA-F0-9]{4}$/.test(hex)) fail('Invalid Unicode escape');
            text += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
          } else {
            const escapes = {
              '"': '"',
              "'": "'",
              '\\': '\\',
              '/': '/',
              b: '\b',
              f: '\f',
              n: '\n',
              r: '\r',
              t: '\t',
            };
            if (!(next in escapes)) fail('Invalid escape');
            text += escapes[next];
          }
        } else {
          if (char.charCodeAt(0) < 32) fail('Control characters must be escaped');
          text += char;
        }
      }
      fail('Unclosed quoted key');
    }
    function path(originAllowed) {
      const origin = expression[pos++];
      if (!originAllowed.includes(origin))
        fail('Expected a path starting with ' + originAllowed.join(' or '));
      const steps = [];
      while (pos < expression.length) {
        if (steps.length >= 64 && ['.', '['].includes(expression[pos]))
          fail('Too many path segments');
        if (expression[pos] === '.') {
          pos++;
          const deep = expression[pos] === '.';
          if (deep) pos++;
          if (expression[pos] === '[') {
            steps.push({ deep, selectors: bracket() });
            continue;
          }
          if (expression[pos] === '*') {
            pos++;
            steps.push({ deep, selectors: [{ kind: 'wild' }] });
            continue;
          }
          const match = expression.slice(pos).match(/^[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*/);
          if (!match) fail('Expected a property name');
          pos += match[0].length;
          steps.push({ deep, selectors: [{ kind: 'name', value: match[0] }] });
        } else if (expression[pos] === '[') steps.push({ deep: false, selectors: bracket() });
        else break;
        if (steps.length > 64) fail('Too many path segments');
      }
      return { origin, steps };
    }
    function bracket() {
      pos++;
      white();
      const selectors = [];
      do {
        white();
        let selector;
        if (expression[pos] === '"' || expression[pos] === "'")
          selector = { kind: 'name', value: quoted() };
        else if (expression[pos] === '*') {
          pos++;
          selector = { kind: 'wild' };
        } else if (expression[pos] === '?') {
          pos++;
          white();
          selector = { kind: 'filter', test: or() };
        } else {
          const match = expression.slice(pos).match(/^-?\d*/);
          const first = match[0];
          pos += first.length;
          white();
          if (expression[pos] === ':') {
            pos++;
            white();
            const m = expression.slice(pos).match(/^-?\d*/)[0];
            pos += m.length;
            white();
            let step = '1';
            if (expression[pos] === ':') {
              pos++;
              white();
              step = expression.slice(pos).match(/^-?\d*/)[0] || '1';
              pos += step === '1' && expression[pos] !== '1' ? 0 : step.length;
            }
            selector = {
              kind: 'slice',
              start: first === '' ? null : Number(first),
              end: m === '' ? null : Number(m),
              step: Number(step),
            };
            if (
              ![selector.start, selector.end, selector.step].every(
                (n) => n === null || Number.isSafeInteger(n),
              )
            )
              fail('Invalid slice');
          } else {
            if (!/^-?(?:0|[1-9]\d*)$/.test(first) || !Number.isSafeInteger(Number(first)))
              fail('Expected a key, index, slice, wildcard or filter');
            selector = { kind: 'index', value: Number(first) };
          }
        }
        selectors.push(selector);
        white();
        if (expression[pos] !== ',') break;
        pos++;
      } while (pos < expression.length);
      if (expression[pos++] !== ']') fail('Expected ]');
      return selectors;
    }
    function operand() {
      white();
      if (expression[pos] === '@' || expression[pos] === '$')
        return { kind: 'path', value: path(['@', '$']) };
      if (expression[pos] === '"' || expression[pos] === "'")
        return { kind: 'literal', value: { type: 'string', value: quoted() } };
      const m = expression
        .slice(pos)
        .match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
      if (!m) fail('Expected a path or JSON literal');
      pos += m[0].length;
      return { kind: 'literal', value: JsonCore.parse(m[0]).root };
    }
    function atom() {
      white();
      if (expression[pos] === '!') {
        pos++;
        return { kind: 'not', child: atom() };
      }
      if (expression[pos] === '(') {
        pos++;
        const expr = or();
        white();
        if (expression[pos++] !== ')') fail('Expected )');
        return expr;
      }
      const left = operand();
      white();
      const op = expression.slice(pos).match(/^(==|!=|<=|>=|<|>)/)?.[0];
      if (op) {
        pos += op.length;
        const right = operand();
        for (const side of [left, right])
          if (
            side.kind === 'path' &&
            side.value.steps.some(
              (s) =>
                s.deep ||
                s.selectors.length !== 1 ||
                !['name', 'index'].includes(s.selectors[0].kind),
            )
          )
            fail('Comparisons require singular paths');
        return { kind: 'compare', left, right, op };
      }
      if (left.kind !== 'path') fail('Existence tests require a path');
      return { kind: 'exists', value: left.value };
    }
    function and() {
      let expr = atom();
      white();
      while (expression.slice(pos, pos + 2) === '&&') {
        pos += 2;
        expr = { kind: 'and', left: expr, right: atom() };
        white();
      }
      return expr;
    }
    function or() {
      let expr = and();
      white();
      while (expression.slice(pos, pos + 2) === '||') {
        pos += 2;
        expr = { kind: 'or', left: expr, right: and() };
        white();
      }
      return expr;
    }
    white();
    const parsedPath = path(['$']);
    white();
    if (pos !== expression.length) fail('Unsupported JSONPath syntax');
    const rootEntry = rootRef(root);
    function test(expr, ref) {
      spend();
      if (expr.kind === 'not') return !test(expr.child, ref);
      if (expr.kind === 'and') return test(expr.left, ref) && test(expr.right, ref);
      if (expr.kind === 'or') return test(expr.left, ref) || test(expr.right, ref);
      if (expr.kind === 'exists') return evaluate(expr.value, ref).length > 0;
      const value = (side) =>
        side.kind === 'literal' ? side.value : evaluate(side.value, ref)[0]?.node;
      const a = value(expr.left),
        b = value(expr.right),
        eq = (!a && !b) || same(a, b);
      if (expr.op === '==') return eq;
      if (expr.op === '!=') return !eq;
      if (!a || !b || a.type !== b.type || !['number', 'string'].includes(a.type)) return false;
      const order =
        a.type === 'number'
          ? compareNumbers(a.raw, b.raw)
          : a.value === b.value
            ? 0
            : a.value < b.value
              ? -1
              : 1;
      return expr.op === '<'
        ? order < 0
        : expr.op === '>'
          ? order > 0
          : expr.op === '<='
            ? order <= 0
            : order >= 0;
    }
    function select(ref, selector) {
      spend();
      const list = children(ref),
        node = ref.node;
      if (selector.kind === 'wild') return list;
      if (selector.kind === 'name')
        return node.type === 'object'
          ? list.filter((_, i) => node.children[i].key === selector.value)
          : [];
      if (selector.kind === 'index') {
        const i = selector.value < 0 ? list.length + selector.value : selector.value;
        return node.type === 'array' && list[i] ? [list[i]] : [];
      }
      if (selector.kind === 'filter') return list.filter((item) => test(selector.test, item));
      if (node.type !== 'array' || selector.step === 0) return [];
      const length = list.length,
        step = selector.step,
        normalize = (n) => (n < 0 ? length + n : n),
        clamp = (n, low, high) => Math.min(high, Math.max(low, n));
      const start =
        selector.start === null
          ? step > 0
            ? 0
            : length - 1
          : clamp(normalize(selector.start), step > 0 ? 0 : -1, step > 0 ? length : length - 1);
      const end =
          selector.end === null
            ? step > 0
              ? length
              : -1
            : clamp(normalize(selector.end), step > 0 ? 0 : -1, step > 0 ? length : length - 1),
        out = [];
      for (let i = start; step > 0 ? i < end : i > end; i += step) {
        spend();
        out.push(list[i]);
      }
      return out;
    }
    function evaluate(spec, current) {
      let refs = [spec.origin === '$' ? rootEntry : current];
      for (const step of spec.steps) {
        const out = [];
        function visit(ref) {
          spend();
          for (const selector of step.selectors) out.push(...select(ref, selector));
          if (out.length > 10000) throw Error('More than 10,000 query results. Narrow the path.');
          if (step.deep) for (const child of children(ref)) visit(child);
        }
        for (const ref of refs) visit(ref);
        refs = out;
      }
      return refs;
    }
    return evaluate(parsedPath, rootEntry);
  }
  function schema(data, schemaRoot) {
    const errors = [],
      active = new Map();
    let work = 0,
      truncated = false;
    const allowed = new Set([
      '$schema',
      '$id',
      '$comment',
      '$defs',
      '$ref',
      'title',
      'description',
      'default',
      'examples',
      'readOnly',
      'writeOnly',
      'deprecated',
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'prefixItems',
      'enum',
      'const',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'minLength',
      'maxLength',
      'pattern',
      'minItems',
      'maxItems',
      'uniqueItems',
      'minProperties',
      'maxProperties',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
    ]);
    const properties = (node) => new Map((node.children || []).map((e) => [e.key, e.node]));
    const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
    const requireType = (node, type, key) => {
      if (node.type !== type) throw Error('Schema ' + key + ' must be ' + type + '.');
    };
    function inspect(node, level = 0) {
      if (level > 128) throw Error('Schema nesting is too deep.');
      if (node.type === 'boolean') return;
      requireType(node, 'object', 'node');
      const seen = new Set();
      for (const entry of node.children) {
        const k = entry.key,
          v = entry.node;
        if (seen.has(k)) throw Error('Duplicate schema keyword: ' + k);
        seen.add(k);
        if (!allowed.has(k)) throw Error('Unsupported schema keyword: ' + k);
        if (['properties', '$defs'].includes(k)) {
          requireType(v, 'object', k);
          const keys = new Set();
          for (const e of v.children) {
            if (keys.has(e.key)) throw Error('Duplicate schema property: ' + e.key);
            keys.add(e.key);
            inspect(e.node, level + 1);
          }
        } else if (['items', 'additionalProperties', 'not'].includes(k)) inspect(v, level + 1);
        else if (['prefixItems', 'allOf', 'anyOf', 'oneOf'].includes(k)) {
          requireType(v, 'array', k);
          if (!v.children.length) throw Error(k + ' must not be empty.');
          v.children.forEach((e) => inspect(e.node, level + 1));
        } else if (k === 'type') {
          const list = v.type === 'array' ? v.children.map((e) => e.node) : [v];
          if (
            !list.length ||
            list.some((n) => n.type !== 'string' || !types.includes(n.value)) ||
            new Set(list.map((n) => n.value)).size !== list.length
          )
            throw Error('Invalid schema type.');
        } else if (k === 'required') {
          requireType(v, 'array', k);
          if (
            v.children.some((e) => e.node.type !== 'string') ||
            new Set(v.children.map((e) => e.node.value)).size !== v.children.length
          )
            throw Error('required must contain unique strings.');
        } else if (k === 'enum') {
          requireType(v, 'array', k);
          if (
            !v.children.length ||
            new Set(v.children.map((e) => signature(e.node))).size !== v.children.length
          )
            throw Error('enum must contain distinct values.');
        } else if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].includes(k))
          requireType(v, 'number', k);
        else if (
          [
            'minLength',
            'maxLength',
            'minItems',
            'maxItems',
            'minProperties',
            'maxProperties',
          ].includes(k)
        ) {
          requireType(v, 'number', k);
          const d = decimal(v.raw);
          if (d.sign < 0 || d.exponent < 0n) throw Error(k + ' must be a nonnegative integer.');
        } else if (k === 'uniqueItems') requireType(v, 'boolean', k);
        else if (k === '$id') {
          requireType(v, 'string', k);
          if (level > 0) throw Error('Nested schema $id scopes are not supported.');
        } else if (['$ref', '$schema', 'pattern'].includes(k)) {
          requireType(v, 'string', k);
          if (k === 'pattern') {
            try {
              new RegExp(v.value, 'u');
            } catch {
              throw Error('Invalid schema pattern.');
            }
          }
          if (
            k === '$schema' &&
            ![
              'https://json-schema.org/draft/2020-12/schema',
              'https://json-schema.org/draft/2020-12/schema#',
            ].includes(v.value)
          )
            throw Error('Only the supported 2020-12 subset is available.');
        }
      }
    }
    inspect(schemaRoot);
    function resolve(ref) {
      if (!ref.startsWith('#')) throw Error('Only local schema references are supported.');
      let pointer;
      try {
        pointer = decodeURIComponent(ref.slice(1));
      } catch {
        throw Error('Invalid schema reference.');
      }
      if (pointer === '') return schemaRoot;
      if (!pointer.startsWith('/')) throw Error('Schema references must use JSON Pointers.');
      let node = schemaRoot;
      for (const part of pointer.slice(1).split('/')) {
        if (/~(?:[^01]|$)/.test(part)) throw Error('Invalid schema pointer.');
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
        node =
          node?.type === 'object'
            ? node.children.find((e) => e.key === key)?.node
            : node?.type === 'array' && /^(0|[1-9]\d*)$/.test(key)
              ? node.children[Number(key)]?.node
              : undefined;
        if (!node) throw Error('Unresolved schema reference: ' + ref);
      }
      return node;
    }
    // Resolve even unused references so an incomplete schema cannot report success.
    function refs(node) {
      if (node.type !== 'object') return;
      for (const { key, node: v } of node.children) {
        if (key === '$ref') inspect(resolve(v.value));
        if (['properties', '$defs'].includes(key)) v.children.forEach((e) => refs(e.node));
        if (['items', 'additionalProperties', 'not'].includes(key)) refs(v);
        if (['prefixItems', 'allOf', 'anyOf', 'oneOf'].includes(key))
          v.children.forEach((e) => refs(e.node));
      }
    }
    refs(schemaRoot);
    function validate(node, s, path, depth = 0) {
      if (++work > 200000 || depth > 256) throw Error('Schema validation is too complex.');
      if (s.type === 'boolean')
        return s.raw === 'true' ? [] : [{ path, node, message: 'This value is not allowed.' }];
      requireType(s, 'object', 'node');
      let instances = active.get(s);
      if (!instances) {
        instances = new Set();
        active.set(s, instances);
      }
      if (instances.has(node)) throw Error('Circular schema reference without a data boundary.');
      instances.add(node);
      const out = [],
        rules = properties(s),
        error = (message) => {
          if (out.length < 201) out.push({ path, node, message });
        };
      try {
        if (rules.has('$ref'))
          out.push(...validate(node, resolve(rules.get('$ref').value), path, depth + 1));
        if (rules.has('type')) {
          const t = rules.get('type'),
            list = t.type === 'array' ? t.children.map((e) => e.node.value) : [t.value];
          if (
            !list.some(
              (type) =>
                type === node.type ||
                (type === 'integer' && node.type === 'number' && decimal(node.raw).exponent >= 0n),
            )
          )
            error('Expected ' + list.join(' or ') + ', received ' + node.type + '.');
        }
        if (rules.has('enum') && !rules.get('enum').children.some((e) => same(node, e.node)))
          error('Value is not in enum.');
        if (rules.has('const') && !same(node, rules.get('const')))
          error('Value does not match const.');
        if (node.type === 'number')
          for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'])
            if (rules.has(key)) {
              const bound = rules.get(key).raw,
                order = compareNumbers(node.raw, bound);
              if (
                key === 'minimum'
                  ? order < 0
                  : key === 'maximum'
                    ? order > 0
                    : key === 'exclusiveMinimum'
                      ? order <= 0
                      : order >= 0
              )
                error(key + ': ' + bound);
            }
        const sizeRules = (size, min, max) => {
          if (rules.has(min) && compareNumbers(String(size), rules.get(min).raw) < 0)
            error(min + ': ' + rules.get(min).raw);
          if (rules.has(max) && compareNumbers(String(size), rules.get(max).raw) > 0)
            error(max + ': ' + rules.get(max).raw);
        };
        if (node.type === 'string') {
          sizeRules([...node.value].length, 'minLength', 'maxLength');
          if (rules.has('pattern') && !new RegExp(rules.get('pattern').value, 'u').test(node.value))
            error('String does not match pattern.');
        }
        if (node.type === 'array') {
          sizeRules(node.children.length, 'minItems', 'maxItems');
          if (
            rules.get('uniqueItems')?.raw === 'true' &&
            new Set(node.children.map((e) => signature(e.node))).size !== node.children.length
          )
            error('Array items must be unique.');
          const prefix = rules.get('prefixItems')?.children || [];
          node.children.forEach((entry, i) => {
            const childSchema = prefix[i]?.node || rules.get('items');
            if (childSchema && out.length < 201)
              out.push(...validate(entry.node, childSchema, pathKey(path, i), depth + 1));
          });
        }
        if (node.type === 'object') {
          sizeRules(node.children.length, 'minProperties', 'maxProperties');
          const keys = new Set(node.children.map((e) => e.key));
          if (keys.size !== node.children.length)
            throw Error('Schema validation requires unique object keys.');
          for (const entry of rules.get('required')?.children || [])
            if (!keys.has(entry.node.value))
              error('Missing required property ' + JSON.stringify(entry.node.value) + '.');
          const props = properties(rules.get('properties') || { children: [] });
          for (const entry of node.children) {
            const childSchema = props.get(entry.key) || rules.get('additionalProperties');
            if (childSchema && out.length < 201)
              out.push(...validate(entry.node, childSchema, pathKey(path, entry.key), depth + 1));
          }
        }
        for (const key of ['allOf', 'anyOf', 'oneOf'])
          if (rules.has(key)) {
            const branches = rules
                .get(key)
                .children.map((e) => validate(node, e.node, path, depth + 1)),
              count = branches.filter((e) => !e.length).length;
            if (key === 'allOf') for (const branch of branches) out.push(...branch);
            else if (key === 'anyOf' ? count === 0 : count !== 1)
              error(
                key === 'anyOf'
                  ? 'Value must match at least one anyOf branch.'
                  : 'Value must match exactly one oneOf branch.',
              );
          }
        if (rules.has('not') && !validate(node, rules.get('not'), path, depth + 1).length)
          error('Value matches the forbidden schema.');
      } finally {
        instances.delete(node);
      }
      return out.slice(0, 201);
    }
    errors.push(...validate(data, schemaRoot, '$'));
    if (errors.length > 200) {
      errors.length = 200;
      truncated = true;
    }
    return { errors, truncated };
  }
  return {
    pathKey,
    children,
    rootRef,
    decimal,
    compareNumbers,
    signature,
    same,
    diff,
    getNode,
    modify,
    query,
    schema,
  };
})();
