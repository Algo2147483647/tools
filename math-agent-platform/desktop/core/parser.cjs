// Deliberately small grammar: constants, one-letter variables, + - * / and parentheses.
// No eval, function calls, property access, powers or generated code.
class InputError extends Error { constructor(message, code = 'UNSUPPORTED') { super(message); this.code = code; } }
function parse(source) {
  if (typeof source !== 'string' || !source.trim()) throw new InputError('Enter a mathematical expression.', 'INVALID_INPUT');
  let text = source.trim();
  if ((text.startsWith('$$') && text.endsWith('$$')) || (text.startsWith('\\[') && text.endsWith('\\]')) || (text.startsWith('\\(') && text.endsWith('\\)'))) text = text.slice(2, -2).trim();
  else if (text.startsWith('$') && text.endsWith('$')) text = text.slice(1, -1).trim();
  text = text.replace(/\u2212/g, '-').replace(/\u00d7/g, '*').replace(/\u00f7/g, '/');
  if (text.length > 4096) throw new InputError('Local expressions are limited to 4,096 characters.', 'LIMIT');
  const tokens = []; let offset = 0;
  while (offset < text.length) {
    const rest = text.slice(offset), space = /^\s+/.exec(rest);
    if (space) { offset += space[0].length; continue; }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+|[a-zA-Z]|[()+\-*/=])/.exec(rest);
    if (!match) throw new InputError(`Unsupported syntax near position ${offset + 1}. Use plain arithmetic or a linear equation.`);
    const value = match[0];
    if (/^[a-zA-Z]$/.test(value) && /^[a-zA-Z]/.test(rest.slice(1))) throw new InputError('Natural-language input requires AI assistance.');
    if (value.length > 256) throw new InputError('A numeric literal exceeds 256 characters.', 'LIMIT');
    tokens.push(value); offset += value.length;
    if (tokens.length > 512) throw new InputError('Expression exceeds 512 tokens.', 'LIMIT');
  }
  let pos = 0, depth = 0;
  const variables = new Set();
  function atom() {
    if (++depth > 64) throw new InputError('Expression nesting exceeds 64 levels.', 'LIMIT');
    const token = tokens[pos++]; let node;
    if (token === '+' || token === '-') node = { type: 'unary', op: token, value: atom() };
    else if (token === '(') { node = expression(); if (tokens[pos++] !== ')') throw new InputError('Missing closing parenthesis.', 'INVALID_INPUT'); }
    else if (/^(?:\d|\.)/.test(token || '')) node = { type: 'number', value: token };
    else if (/^[a-zA-Z]$/.test(token || '')) { variables.add(token); node = { type: 'variable', name: token }; }
    else throw new InputError('Expected a number, variable, or parenthesized expression.', 'INVALID_INPUT');
    depth--; return node;
  }
  function term() {
    let node = atom();
    while (pos < tokens.length) {
      let op = tokens[pos];
      if (op === '*' || op === '/') pos++;
      else if (/^[a-zA-Z]$/.test(op) || op === '(') op = '*';
      else break;
      node = { type: 'binary', op, left: node, right: atom() };
    }
    return node;
  }
  function expression() {
    let node = term();
    while (tokens[pos] === '+' || tokens[pos] === '-') { const op = tokens[pos++]; node = { type: 'binary', op, left: node, right: term() }; }
    return node;
  }
  const left = expression(); let right = null;
  if (tokens[pos] === '=') { pos++; right = expression(); }
  if (pos !== tokens.length) throw new InputError('Unexpected token or multiple equality signs.', 'INVALID_INPUT');
  if (variables.size > 1) throw new InputError('Local solving currently supports one variable. Specify parameter values or use AI assistance.');
  if (!right && variables.size) throw new InputError('An expression with a variable needs an equality and a right-hand side.', 'NEEDS_INPUT');
  return { schemaVersion: 1, domain: right ? 'linear-equation' : 'arithmetic', source: text, variable: [...variables][0] || null, assumptions: ['Real-valued variables', 'Exact rational constants'], left, right };
}
module.exports = { parse, InputError };
