// A small JSON syntax tree preserves number lexemes, duplicate keys and key order.
// User content is never evaluated and never inserted as HTML.
export const JsonCore = (() => {
  const MAX_LENGTH = 2 * 1024 * 1024,
    MAX_NODES = 50000,
    MAX_DEPTH = 128;
  class ParseError extends Error {
    constructor(message, position) {
      super(message);
      this.position = position;
    }
  }
  function parse(text) {
    let pos = 0,
      count = 0,
      depth = 0,
      duplicateKeys = 0;
    const fail = (message) => {
      throw new ParseError(message, pos);
    };
    if (text.length > MAX_LENGTH)
      fail('Input exceeds 2 Mi characters. Reduce its size and try again.');
    function whitespace() {
      while (pos < text.length && /[\x20\t\r\n]/.test(text[pos])) pos++;
    }
    function string() {
      const start = pos++;
      while (pos < text.length) {
        const char = text[pos++];
        if (char === '"') return JSON.parse(text.slice(start, pos));
        if (char.charCodeAt(0) < 32) {
          pos--;
          fail('Escape line breaks and control characters inside strings');
        }
        if (char === '\\') {
          if (pos >= text.length) fail('Incomplete escape sequence');
          const escape = text[pos++];
          if (escape === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(pos, pos + 4)))
              fail('Unicode escapes require four hexadecimal digits');
            pos += 4;
          } else if (!'"\\/bfnrt'.includes(escape)) {
            pos--;
            fail('Invalid escape sequence');
          }
        }
      }
      fail('Missing closing double quote');
    }
    function value(level) {
      whitespace();
      if (level > MAX_DEPTH) fail('Nesting exceeds 128 levels. Simplify the structure.');
      if (++count > MAX_NODES) fail('More than 50,000 nodes. Split the data into smaller parts.');
      depth = Math.max(depth, level);
      const start = pos,
        char = text[pos];
      let node;
      if (char === '{' || char === '[') {
        const isObject = char === '{',
          close = isObject ? '}' : ']';
        node = { type: isObject ? 'object' : 'array', children: [], start };
        const seen = new Set();
        pos++;
        whitespace();
        if (text[pos] !== close) {
          while (true) {
            let key;
            if (isObject) {
              if (text[pos] !== '"') fail('Object keys must use double quotes');
              key = string();
              whitespace();
              if (text[pos] !== ':') fail('Expected a colon : after the key');
              pos++;
              if (seen.has(key)) duplicateKeys++;
              seen.add(key);
            }
            const child = value(level + 1);
            node.children.push(isObject ? { key, node: child } : { node: child });
            whitespace();
            if (text[pos] === close) break;
            if (text[pos] !== ',') fail('Expected a comma , or closing ' + close);
            pos++;
            whitespace();
            if (text[pos] === close) fail('Trailing commas are not allowed');
          }
        }
        pos++;
      } else if (char === '"') node = { type: 'string', value: string(), start };
      else if (char === '-' || /[0-9]/.test(char || '')) {
        const match = text.slice(pos).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (!match) fail('Invalid number');
        pos += match[0].length;
        node = { type: 'number', raw: match[0], start };
      } else {
        const literal = ['true', 'false', 'null'].find((item) => text.startsWith(item, pos));
        if (!literal)
          fail(
            pos === text.length
              ? 'Unexpected end of JSON; a value or closing bracket is missing'
              : 'Expected a valid JSON value',
          );
        pos += literal.length;
        node = { type: literal === 'null' ? 'null' : 'boolean', raw: literal, start };
      }
      node.end = pos;
      return node;
    }
    const root = value(0);
    whitespace();
    if (pos !== text.length) fail('Unexpected characters after the JSON value');
    return { root, count, depth, duplicateKeys };
  }
  const primitive = (node) => (node.type === 'string' ? JSON.stringify(node.value) : node.raw);
  function stringify(node, indent = '  ', level = 0) {
    if (!node.children) return primitive(node);
    const object = node.type === 'object',
      open = object ? '{' : '[',
      close = object ? '}' : ']';
    if (!node.children.length) return open + close;
    const pad = indent.repeat(level + 1),
      separator = indent ? ',\n' : ',';
    const body = node.children
      .map(
        (entry) =>
          (indent ? pad : '') +
          (object ? JSON.stringify(entry.key) + (indent ? ': ' : ':') : '') +
          stringify(entry.node, indent, level + 1),
      )
      .join(separator);
    return open + (indent ? '\n' : '') + body + (indent ? '\n' + indent.repeat(level) : '') + close;
  }
  function sorted(node) {
    if (!node.children) return node;
    const children = node.children.map((entry) => ({ ...entry, node: sorted(entry.node) }));
    if (node.type === 'object')
      children.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { ...node, children };
  }
  function reversed(node) {
    if (node.type === 'array') return { ...node, children: [...node.children].reverse() };
    if (node.type === 'object' && node.children.some((entry) => entry.node.type === 'array'))
      return {
        ...node,
        children: node.children.map((entry) =>
          entry.node.type === 'array' ? { ...entry, node: reversed(entry.node) } : entry,
        ),
      };
    throw new Error('Expected a root array or an object with direct array fields');
  }
  function unescape(text) {
    const trim = text.trim();
    if (trim.startsWith('"')) {
      const { root } = parse(trim);
      if (root.type !== 'string') throw new Error('Expected a JSON string');
      return root.value;
    }
    try {
      return JSON.parse('"' + text + '"');
    } catch {
      throw new Error('Expected escaped text, such as {\\"key\\":1} or a quoted JSON string');
    }
  }
  function transform(text, action, indent = '  ') {
    if (action === 'escape') return JSON.stringify(text);
    if (action === 'unescape') return unescape(text);
    const { root } = parse(text);
    if (action === 'compact') return stringify(root, '');
    if (action === 'sort') return stringify(sorted(root), indent);
    if (action === 'reverse') return stringify(reversed(root), indent);
    const formatted = stringify(root, indent);
    if (action === 'unicode')
      return formatted.replace(
        /[\u007f-\uffff]/g,
        (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
      );
    return formatted;
  }
  return { parse, stringify, primitive, transform, ParseError, MAX_LENGTH };
})();
