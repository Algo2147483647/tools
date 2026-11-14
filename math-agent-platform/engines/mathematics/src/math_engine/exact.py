"""Bounded affine grammar; Fraction solver and independent AST substitution verifier."""
import re
from fractions import Fraction
from .common import ToolError, value_result


def bounded(v):
    if max(v.numerator.bit_length(), v.denominator.bit_length()) > 4096:
        raise ToolError('LIMIT', 'Arithmetic complexity limit exceeded.')
    return v


def parse(source, format='ascii'):
    from .ir import parse as parse_ir, validate_ir
    if isinstance(source,dict):
        validate_ir(source);tree=source
    else:tree=parse_ir(source,format,implicit=True)
    variables=set()
    def convert(n):
        kind=n['kind']
        if kind in ('Integer','DecimalLiteral'):return ('number',n['value'])
        if kind=='Rational':return ('number',n['numerator']+'/'+n['denominator'])
        if kind=='Symbol':
            if len(n['name'])!=1:raise ToolError('UNSUPPORTED','Affine variables must be single letters.')
            variables.add(n['name']);return ('variable',n['name'])
        if kind=='Unary':return ('unary',n['operator'],convert(n['args'][0]))
        ops={'Add':'+','Subtract':'-','Multiply':'*','Divide':'/','Power':'^'}
        if kind in ops:return ('binary',ops[kind],*[convert(v) for v in n['args']])
        raise ToolError('UNSUPPORTED','Exact affine arithmetic does not support '+kind+'.')
    left,right=(convert(tree['args'][0]),convert(tree['args'][1])) if tree['kind']=='Equation' else (convert(tree),None)
    if len(variables)>1:raise ToolError('UNSUPPORTED','Only one affine variable is supported.')
    if variables and right is None:raise ToolError('NEEDS_INPUT','Variable expressions require an equation.')
    return source,next(iter(variables),None),left,right


def exponent(base, value):
    if value.denominator != 1:
        raise ToolError('UNSUPPORTED', 'Exact rational powers require an integer exponent; use symbolic_math for radicals.')
    n = value.numerator
    if abs(n) > 4096: raise ToolError('LIMIT', 'Integer exponent magnitude exceeds 4096.')
    if not base and n <= 0:
        raise ToolError('DOMAIN_ERROR', 'Zero to a zero or negative power is undefined.')
    if max(base.numerator.bit_length()-1, base.denominator.bit_length()-1)*abs(n) > 4096:
        raise ToolError('LIMIT', 'Power exceeds the arithmetic complexity limit.')
    return n


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
    elif op == '^':
        if c: raise ToolError('UNSUPPORTED', 'Variable exponents are unsupported.')
        if a:
            if d != 1: raise ToolError('UNSUPPORTED', 'Only the first power of a variable expression is affine.')
            pair = a, b
        else: pair = Fraction(0), bounded(b ** exponent(b, d))
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
    if op == '^':
        if rv or (lv and r != 1):
            raise ToolError('UNSUPPORTED', 'Verifier rejects variable exponents and nonlinear powers.')
        if lv: return l, True
        n = exponent(l, r)
        base = 1/l if n < 0 else l
        value = Fraction(1)
        # Separate repeated-squaring evaluation verifies Fraction's power result.
        n = abs(n)
        while n:
            if n & 1: value = bounded(value * base)
            n >>= 1
            if n: base = bounded(base * base)
        return value, False
    if (op == '*' and lv and rv) or (op == '/' and rv):
        raise ToolError('UNSUPPORTED', 'Verifier rejects nonlinear operations and variable denominators.')
    v = l+r if op == '+' else l-r if op == '-' else l*r if op == '*' else l/r
    return bounded(v), lv or rv


def exact(args):
    if args.get('operation','evaluate') != 'evaluate':return arithmetic(args)
    if any(k in args for k in ('other','digits','rounding')):raise ToolError('INVALID_ARGUMENT','Unused arithmetic arguments.')
    text, variable, left, right = parse(args.get('expression',args.get('ir')),args.get('format','ascii'))
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
    from .ir import input_tree
    result['inputIR']=input_tree(args,implicit=True)
    result['irVersion']=1
    if not passed: raise ToolError('VERIFICATION_FAILED', 'Exact verification failed.')
    return value_result(result, verification=verification, assumptions=['Exact rational constants', 'Real-valued variables'])


def arithmetic(args):
    op=args['operation']
    if op not in ('floor','ceil','truncate','mod','compare','round'):raise ToolError('UNSUPPORTED','Unknown exact operation.')
    if ('other' in args)!=(op in ('mod','compare')):raise ToolError('INVALID_ARGUMENT','other is required only for mod and compare.')
    if op!='round' and any(k in args for k in ('digits','rounding')):raise ToolError('INVALID_ARGUMENT','Rounding fields apply only to round.')
    def rational(text):
        _,variable,left,right=parse(text,args.get('format','ascii'))
        if variable or right is not None:raise ToolError('INVALID_ARGUMENT','A rational constant is required.')
        v,dependent=evaluate(left,Fraction(0))
        return bounded(v)
    a=rational(args.get('expression',args.get('ir')));b=rational(args['other']) if 'other' in args else None
    if op=='floor':value=Fraction(a.numerator//a.denominator)
    elif op=='ceil':value=Fraction(-((-a.numerator)//a.denominator))
    elif op=='truncate':value=Fraction(int(a))
    elif op=='compare':value=Fraction((a>b)-(a<b))
    elif op=='mod':
        if b==0:raise ToolError('DOMAIN_ERROR','Modulo by zero.')
        value=a-b*(a//b)
    else:
        digits=args.get('digits',0);mode=args.get('rounding','half_even');scale=Fraction(10)**digits;t=a*scale
        sign=-1 if t<0 else 1; t=abs(t);q,r=divmod(t.numerator,t.denominator)
        if 2*r>t.denominator or 2*r==t.denominator and (mode=='half_away_from_zero' or q%2):q+=1
        value=Fraction(sign*q)/scale
    value=bounded(value)
    from .ir import encode,input_tree
    import sympy as sp
    result=dict(kind='scalar',value=str(value),exact=True,representation='exact',ir=encode(sp.Rational(value.numerator,value.denominator)),
                inputIR=input_tree(args,implicit=True),irVersion=1)
    return value_result(result,diagnostics={'operation':op,'modConvention':'a-b*floor(a/b)' if op=='mod' else None,
                        'rounding':args.get('rounding','half_even') if op=='round' else None},
                        assumptions=['Exact rational arithmetic; comparison returns -1, 0 or 1.'])
