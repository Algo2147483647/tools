"""Bounded affine grammar; Fraction solver and independent AST substitution verifier."""
import re
from fractions import Fraction
from .common import ToolError, value_result


def bounded(v):
    if max(v.numerator.bit_length(), v.denominator.bit_length()) > 4096:
        raise ToolError('LIMIT', 'Arithmetic complexity limit exceeded.')
    return v


def parse(source):
    if not isinstance(source, str) or not source.strip():
        raise ToolError('INVALID_INPUT', 'Enter a mathematical expression.')
    text = source.strip()
    for left, right in [('$$', '$$'), ('\\[', '\\]'), ('\\(', '\\)'), ('$', '$')]:
        if text.startswith(left) and text.endswith(right):
            text = text[len(left):-len(right)].strip()
            break
    text = text.replace('−', '-').replace('×', '*').replace('÷', '/')
    if len(text) > 4096: raise ToolError('LIMIT', 'Expression exceeds 4096 characters.')
    tokens = []; offset = 0
    while offset < len(text):
        m = re.match(r'\s+|\d+(?:\.\d*)?|\.\d+|[A-Za-z]|[()+*/=\-]', text[offset:])
        if not m: raise ToolError('UNSUPPORTED', 'Unsupported exact expression syntax.')
        token = m[0]; offset += len(token)
        if token.isspace(): continue
        if token.isalpha() and offset < len(text) and text[offset].isalpha():
            raise ToolError('UNSUPPORTED', 'Only single-letter variables are supported.')
        if len(token) > 256: raise ToolError('LIMIT', 'Numeric literal is too long.')
        tokens.append(token)
        if len(tokens) > 512: raise ToolError('LIMIT', 'Expression exceeds 512 tokens.')
    pos = 0; variables = set()
    def peek(): return tokens[pos] if pos < len(tokens) else None
    def atom(depth):
        nonlocal pos
        if depth > 64: raise ToolError('LIMIT', 'Expression nesting exceeds 64 levels.')
        token = peek(); pos += 1
        if token in ('+', '-'): return ('unary', token, atom(depth + 1))
        if token == '(':
            result = expr(depth + 1)
            if peek() != ')': raise ToolError('INVALID_INPUT', 'Missing closing parenthesis.')
            pos += 1; return result
        if token and re.fullmatch(r'\d+(?:\.\d*)?|\.\d+', token): return ('number', token)
        if token and re.fullmatch('[A-Za-z]', token): variables.add(token); return ('variable', token)
        raise ToolError('INVALID_INPUT', 'Expected a number, variable or parenthesized expression.')
    def term(depth):
        nonlocal pos
        node = atom(depth)
        while peek() is not None:
            op = peek()
            if op in ('*', '/'): pos += 1
            elif op == '(' or re.fullmatch('[A-Za-z]', op): op = '*'
            else: break
            node = ('binary', op, node, atom(depth))
        return node
    def expr(depth=0):
        nonlocal pos
        node = term(depth)
        while peek() in ('+', '-'):
            op = peek(); pos += 1; node = ('binary', op, node, term(depth))
        return node
    left = expr(); right = None
    if peek() == '=': pos += 1; right = expr()
    if pos != len(tokens): raise ToolError('INVALID_INPUT', 'Unexpected token or equality sign.')
    if len(variables) > 1: raise ToolError('UNSUPPORTED', 'Only one variable is supported.')
    if variables and right is None: raise ToolError('NEEDS_INPUT', 'A variable expression requires an equation.')
    return text, next(iter(variables), None), left, right


def affine(node):
    kind = node[0]
    if kind == 'number': return Fraction(0), Fraction(node[1])
    if kind == 'variable': return Fraction(1), Fraction(0)
    if kind == 'unary':
        a, b = affine(node[2]); return (a, b) if node[1] == '+' else (-a, -b)
    a, b = affine(node[2]); c, d = affine(node[3]); op = node[1]
    if op == '+': pair = a+c, b+d
    elif op == '-': pair = a-c, b-d
    elif op == '*':
        if a and c: raise ToolError('UNSUPPORTED', 'Nonlinear products are unsupported.')
        pair = a*d+c*b, b*d
    else:
        if c: raise ToolError('UNSUPPORTED', 'Variable denominators are unsupported.')
        pair = a/d, b/d
    return tuple(bounded(v) for v in pair)


def evaluate(node, x):
    if node[0] == 'number': return Fraction(node[1]), False
    if node[0] == 'variable': return x, True
    if node[0] == 'unary':
        v, dependent = evaluate(node[2], x)
        return (-v if node[1] == '-' else v), dependent
    l, lv = evaluate(node[2], x); r, rv = evaluate(node[3], x); op = node[1]
    if (op == '*' and lv and rv) or (op == '/' and rv):
        raise ToolError('UNSUPPORTED', 'Verifier rejects nonlinear operations and variable denominators.')
    v = l+r if op == '+' else l-r if op == '-' else l*r if op == '*' else l/r
    return bounded(v), lv or rv


def exact(args):
    text, variable, left, right = parse(args['expression'])
    a, b = affine(left); c, d = affine(right) if right else (Fraction(0), Fraction(0))
    coefficient, constant = bounded(a-c), bounded(b-d)
    candidate = {'engine': 'python-exact-affine/2', 'variable': variable}
    if right is None: candidate.update(kind='value', value=str(b))
    elif coefficient: candidate.update(kind='unique', value=str(bounded(-constant/coefficient)))
    else: candidate['kind'] = 'identity' if not constant else 'no-solution'
    # Independent evaluator checks syntactic affine restrictions, not just sample agreement.
    delta = lambda x: evaluate(left, x)[0] - (evaluate(right, x)[0] if right else 0)
    v0, v1 = delta(Fraction(0)), delta(Fraction(1))
    kind = candidate['kind']
    passed = (v0 == Fraction(candidate['value']) if kind == 'value' else
              delta(Fraction(candidate['value'])) == 0 and v1 != v0 if kind == 'unique' else
              v0 == v1 == 0 if kind == 'identity' else v0 == v1 and v0 != 0)
    verification = {'status': 'passed' if passed else 'failed', 'scope': 'Exact affine model only; not a proof of natural-language interpretation.',
                    'checks': [{'name': 'Independent affine evaluation and substitution', 'passed': bool(passed)}]}
    result = {'model': {'source': text, 'variable': variable, 'domain': 'linear-equation' if right else 'arithmetic'}, 'candidate': candidate, 'verification': verification}
    if not passed: raise ToolError('VERIFICATION_FAILED', 'Exact verification failed.')
    return value_result(result, verification=verification, assumptions=['Exact rational constants', 'Real-valued variables'])
