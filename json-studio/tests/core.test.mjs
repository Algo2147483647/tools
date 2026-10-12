import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonCore } from '../public/src/json-core.js';
import { EditorCore } from '../public/src/editor-core.js';
import { StudioCore } from '../public/src/studio-core.js';
import { analyzeDocument } from '../public/src/analysis.js';

const parse = (text) => JsonCore.parse(text).root;
const compact = (node) => JsonCore.stringify(node, '');

test('formatting preserves large numbers, duplicate keys, key order and negative zero', () => {
  const input = '{"z":9007199254740993,"a":1.2300e+99,"a":-0}';
  const result = JsonCore.parse(input);
  assert.equal(result.duplicateKeys, 1);
  assert.equal(compact(result.root), input);
  assert.equal(JsonCore.transform(JsonCore.transform(input, 'format'), 'compact'), input);
});

test('source ranges identify exact nested values', () => {
  const text = '{ "items": [true, "你好\\n世界", null] }';
  const refs = StudioCore.query(parse(text), '$.items[*]');
  assert.deepEqual(
    refs.map(({ node }) => text.slice(node.start, node.end)),
    ['true', '"你好\\n世界"', 'null'],
  );
});

test('invalid JSON reports a usable position', () => {
  for (const text of ['{"a":1,}', '[01]', '"\\x"', '{', 'true false', '"line\nbreak"']) {
    assert.throws(
      () => JsonCore.parse(text),
      (error) => {
        assert.ok(error instanceof JsonCore.ParseError);
        assert.ok(Number.isInteger(error.position));
        return true;
      },
    );
  }
});

test('parser enforces size, depth and node limits', () => {
  assert.throws(() => parse(' '.repeat(JsonCore.MAX_LENGTH + 1)), /2 Mi/);
  assert.throws(() => parse('['.repeat(130) + '0' + ']'.repeat(130)), /128 levels/);
  assert.throws(() => parse('[' + Array(50000).fill('0').join(',') + ']'), /50,000 nodes/);
});

test('transformations preserve data and sort recursively', () => {
  const text = '{"z":[2,1],"a":{"y":1,"b":"你好😀"}}';
  assert.equal(JsonCore.transform(text, 'sort', ''), '{"a":{"b":"你好😀","y":1},"z":[2,1]}');
  assert.equal(JsonCore.transform(text, 'reverse', ''), '{"z":[1,2],"a":{"y":1,"b":"你好😀"}}');
  assert.equal(JsonCore.transform(JsonCore.transform(text, 'escape'), 'unescape'), text);
  assert.deepEqual(JSON.parse(JsonCore.transform(text, 'unicode')), JSON.parse(text));
});

test('numeric comparison stays exact beyond floating point range', () => {
  assert.equal(StudioCore.compareNumbers('9007199254740993', '9007199254740992'), 1);
  assert.equal(StudioCore.compareNumbers('1e10000', '9e9999'), 1);
  assert.equal(StudioCore.compareNumbers('1.2300', '123e-2'), 0);
  assert.equal(StudioCore.compareNumbers('-0', '0'), 0);
  assert.equal(StudioCore.compareNumbers('-2', '-1'), -1);
});

test('diff distinguishes added, removed, modified and reordered values', () => {
  const before = parse('{"a":1,"b":2,"gone":0}');
  const after = parse('{"a":3,"b":2,"new":0}');
  assert.deepEqual(
    StudioCore.diff(before, after).map(({ kind, path }) => ({ kind, path })),
    [
      { kind: 'modified', path: '$["a"]' },
      { kind: 'removed', path: '$["gone"]' },
      { kind: 'added', path: '$["new"]' },
    ],
  );
  const ordered = parse('{"a":1,"b":2}'),
    reversed = parse('{"b":2,"a":1.0}');
  assert.equal(StudioCore.diff(ordered, reversed).length, 0);
  assert.equal(StudioCore.diff(ordered, reversed, false)[0].kind, 'reordered');
});

test('JSONPath supports filters, recursive descent, quoted keys and reverse slices', () => {
  const root = parse('{"records":[{"id":9007199254740992},{"id":9007199254740993}],"a.b":[1,2,3]}');
  assert.deepEqual(
    StudioCore.query(root, '$.records[?(@.id > 9007199254740992)].id').map(({ node }) => node.raw),
    ['9007199254740993'],
  );
  assert.equal(StudioCore.query(root, '$..id').length, 2);
  assert.deepEqual(
    StudioCore.query(root, '$["a.b"][::-1]').map(({ node }) => node.raw),
    ['3', '2', '1'],
  );
  assert.throws(() => StudioCore.query(root, '$.records.map(alert)'), /Unsupported/);
});

test('node edits leave the original tree intact and protect duplicate names', () => {
  const root = parse('{"a":[1,2],"b":3}');
  const edited = StudioCore.modify(root, [0, 1], 'replace', { value: '9007199254740993' });
  assert.equal(compact(root), '{"a":[1,2],"b":3}');
  assert.equal(compact(edited), '{"a":[1,9007199254740993],"b":3}');
  assert.equal(compact(StudioCore.modify(root, [1], 'remove')), '{"a":[1,2]}');
  assert.throws(() => StudioCore.modify(root, [1], 'rename', { key: 'a' }), /already exists/);
  assert.throws(() => StudioCore.modify(root, [], 'remove'), /root cannot/);
});

test('schema validation supports local references and exact numeric boundaries', () => {
  const schema = parse(
    '{"$defs":{"id":{"type":"integer","minimum":9007199254740993}},"type":"object","required":["id"],"properties":{"id":{"$ref":"#/$defs/id"}},"additionalProperties":false}',
  );
  assert.equal(StudioCore.schema(parse('{"id":9007199254740993}'), schema).errors.length, 0);
  const result = StudioCore.schema(parse('{"id":9007199254740992,"extra":true}'), schema);
  assert.deepEqual(
    result.errors.map(({ path }) => path),
    ['$["id"]', '$["extra"]'],
  );
  assert.throws(
    () => StudioCore.schema(parse('1'), parse('{"format":"email"}')),
    /Unsupported schema keyword/,
  );
  assert.throws(
    () => StudioCore.schema(parse('1'), parse('{"$ref":"https://example.com/schema"}')),
    /Only local/,
  );
});

test('analysis entry point dispatches all jobs and rejects duplicate schema data', () => {
  assert.equal(analyzeDocument('diff', { text: '1', after: '2' })[0].kind, 'modified');
  assert.equal(analyzeDocument('path', { text: '[1]', expression: '$[0]' })[0].node.raw, '1');
  assert.equal(
    analyzeDocument('schema', { text: '1', schema: '{"type":"integer"}' }).errors.length,
    0,
  );
  assert.throws(
    () => analyzeDocument('schema', { text: '{"a":1,"a":2}', schema: 'true' }),
    /unique object keys/,
  );
  assert.throws(() => analyzeDocument('unknown', { text: 'null' }), /Unknown analysis/);
});

test('editor brackets ignore quoted brackets and multiline indentation round-trips', () => {
  const text = '{"brackets":"[]", "items":[1]}';
  const { pairs } = EditorCore.analyze(text);
  assert.equal(pairs.get(0), text.length - 1);
  assert.equal(pairs.has(text.indexOf('[]')), false);
  const original = 'one\ntwo\n';
  const indented = EditorCore.indentSelection(original, 0, original.length, '  ');
  assert.equal(indented.text, '  one\n  two\n');
  assert.equal(
    EditorCore.indentSelection(indented.text, 0, indented.end, '  ', true).text,
    original,
  );
});
