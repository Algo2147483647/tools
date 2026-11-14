const { Rational: R } = require('./rational.cjs');
const { parse, InputError } = require('./parser.cjs');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zero = () => new R(0), one = () => new R(1);
// Solver transforms the AST into a*x + b. The verifier below does not use this transform.
function linear(node) {
  if (node.type === 'number') return [zero(), R.from(node.value)];
  if (node.type === 'variable') return [one(), zero()];
  if (node.type === 'unary') { const v = linear(node.value); return node.op === '-' ? v.map(x => x.neg()) : v; }
  const [a, b] = linear(node.left), [c, d] = linear(node.right);
  if (node.op === '+') return [a.add(c), b.add(d)];
  if (node.op === '-') return [a.sub(c), b.sub(d)];
  if (node.op === '*') {
    if (!a.zero && !c.zero) throw new InputError('Nonlinear products are outside the local solver domain.');
    return [a.mul(d).add(c.mul(b)), b.mul(d)];
  }
  if (!c.zero) throw new InputError('Variable denominators are outside the local solver domain.');
  return [a.div(d), b.div(d)];
}
function candidate(model) {
  const [a, b] = linear(model.left);
  if (!model.right) return { kind: 'value', value: b.toString(), engine: 'exact-linear/1' };
  const [c, d] = linear(model.right), coefficient = a.sub(c), constant = b.sub(d);
  if (coefficient.zero) return { kind: constant.zero ? 'identity' : 'no-solution', variable: model.variable, engine: 'exact-linear/1' };
  return { kind: 'unique', variable: model.variable, value: constant.neg().div(coefficient).toString(), engine: 'exact-linear/1' };
}
// Independent AST evaluator also checks the affine preconditions. Sampling alone is never a proof.
function evaluate(node, value) {
  if (node.type === 'number') return { value: R.from(node.value), variable: false };
  if (node.type === 'variable') return { value, variable: true };
  if (node.type === 'unary') { const v = evaluate(node.value, value); return { ...v, value: node.op === '-' ? v.value.neg() : v.value }; }
  const l = evaluate(node.left, value), r = evaluate(node.right, value);
  if (node.op === '*' && l.variable && r.variable) throw Error('Verifier rejects products of variable-dependent expressions.');
  if (node.op === '/' && r.variable) throw Error('Verifier rejects variable-dependent denominators.');
  const operations = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };
  return { value: l.value[operations[node.op]](r.value), variable: l.variable || r.variable };
}
function verify(model, result) {
  const checks = [], check = (name, passed, detail) => checks.push({ name, passed, detail });
  try {
    check('Variable binding', (result.variable || null) === model.variable, 'The candidate uses the parsed variable.');
    if (!model.right) {
      const actual = evaluate(model.left, zero()).value;
      check('Exact recomputation', result.kind === 'value' && actual.eq(R.from(result.value)), `Expression = ${actual}`);
    } else {
      const delta = x => evaluate(model.left, x).value.sub(evaluate(model.right, x).value);
      const atZero = delta(zero()), atOne = delta(one()), slope = atOne.sub(atZero);
      check('Affine domain', true, 'AST independently restricted to affine operations with constant denominators.');
      if (result.kind === 'unique') {
        const x = R.from(result.value), left = evaluate(model.left, x).value, right = evaluate(model.right, x).value;
        check('Original equation substitution', left.eq(right), `Left = ${left}; right = ${right}`);
        check('Unique solution', !slope.zero, `Nonzero affine coefficient: ${slope}`);
      } else if (result.kind === 'identity') check('Identity', slope.zero && atZero.zero, 'The affine difference is identically zero.');
      else if (result.kind === 'no-solution') check('Contradiction', slope.zero && !atZero.zero, `The affine difference is the nonzero constant ${atZero}.`);
      else check('Candidate type', false, 'Unexpected result kind.');
    }
  } catch (error) { check('Verification completed', false, error.message); }
  return { status: checks.every(c => c.passed) ? 'passed' : 'failed', checks, modelHash: hash(model), candidateHash: hash(result), verifier: 'independent-affine-evaluator/1', scope: 'Exact result for the parsed mathematical model; natural-language interpretation is not certified.' };
}
function solve(source, emit = () => {}) {
  emit('understanding', 'Parsing a bounded mathematical expression');
  const model = parse(source); emit('solving', 'Computing with exact rational arithmetic');
  const result = candidate(model); emit('verifying', 'Independently checking the original expression');
  const verification = verify(model, result);
  return { model, candidate: result, verification };
}
module.exports = { solve, candidate, verify, hash };
