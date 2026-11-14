"""Exact finite sets and real intervals; complement always has an explicit universe."""
import sympy as sp
from .common import ToolError,value_result,math_view

SET_KINDS={'EmptySet','Universe','FiniteSet','Interval','Union','Intersection','Complement'}


def decode_set(tree, depth=0, budget=None):
    from .ir import validate_ir,lower
    if budget is None:budget=[0]
    budget[0]+=1
    if depth>24 or budget[0]>200:raise ToolError('RESOURCE_LIMIT','Set expression exceeds budget.')
    if not isinstance(tree,dict):raise ToolError('INVALID_ARGUMENT','Set node must be an object.')
    kind=tree.get('kind')
    def keys(*names):
        if set(tree)!={'kind',*names}:raise ToolError('INVALID_ARGUMENT','Unexpected or missing set fields.')
    def scalar(value,infinity=False):
        if infinity and value in ('-inf','inf'):return -sp.oo if value=='-inf' else sp.oo
        validate_ir(value);v=sp.simplify(lower(value))
        from .domains import analyze
        conditions,domain=analyze(value)
        if conditions or not domain['analysisComplete']:raise ToolError('INVALID_ARGUMENT','Set entries require an unconditional constant domain.')
        if not isinstance(v,sp.Expr) or v.free_symbols or v.is_real is not True or v.is_finite is not True:raise ToolError('INVALID_ARGUMENT','Set entries and finite endpoints must be real constants.')
        return v
    if kind=='EmptySet':keys();return sp.S.EmptySet
    if kind=='Universe':
        keys('name')
        if tree['name'] not in ('Reals','Integers'):raise ToolError('UNSUPPORTED','Supported universes are Reals and Integers.')
        return sp.S.Reals if tree['name']=='Reals' else sp.S.Integers
    if kind=='FiniteSet':
        keys('elements')
        if not isinstance(tree['elements'],list) or len(tree['elements'])>100:raise ToolError('RESOURCE_LIMIT','Use at most 100 set elements.')
        return sp.FiniteSet(*[scalar(v) for v in tree['elements']])
    if kind=='Interval':
        keys('start','end','leftOpen','rightOpen')
        if type(tree['leftOpen']) is not bool or type(tree['rightOpen']) is not bool:raise ToolError('INVALID_ARGUMENT','Endpoint openness must be boolean.')
        a,b=scalar(tree['start'],True),scalar(tree['end'],True)
        if a==sp.oo or b==-sp.oo or (a<=b) is not sp.S.true:raise ToolError('INVALID_ARGUMENT','Interval endpoints must be ordered.')
        if a==-sp.oo and not tree['leftOpen'] or b==sp.oo and not tree['rightOpen']:raise ToolError('INVALID_ARGUMENT','Infinite endpoints must be open.')
        return sp.Interval(a,b,left_open=tree['leftOpen'],right_open=tree['rightOpen'])
    if kind in ('Union','Intersection','Complement'):
        keys('args')
        if not isinstance(tree['args'],list) or len(tree['args'])!=2:raise ToolError('INVALID_ARGUMENT','Set operations take two operands.')
        operands=[decode_set(v,depth+1,budget) for v in tree['args']]
        return {'Union':sp.Union,'Intersection':sp.Intersection,'Complement':sp.Complement}[kind](*operands)
    raise ToolError('UNSUPPORTED','Unsupported set kind.')


def encode_set(value):
    from .ir import encode,node
    if value is sp.S.EmptySet:return node('EmptySet')
    if value is sp.S.Reals:return node('Universe',name='Reals')
    if value is sp.S.Integers:return node('Universe',name='Integers')
    if isinstance(value,sp.FiniteSet):return node('FiniteSet',elements=[encode(v) for v in value])
    if isinstance(value,sp.Interval):return node('Interval',start='-inf' if value.start==-sp.oo else encode(value.start),
        end='inf' if value.end==sp.oo else encode(value.end),leftOpen=bool(value.left_open),rightOpen=bool(value.right_open))
    if isinstance(value,(sp.Union,sp.Intersection,sp.Complement)):
        args=list(value.args);result=encode_set(args[0])
        for v in args[1:]:result=node(type(value).__name__,args=[result,encode_set(v)])
        return result
    raise ToolError('UNSUPPORTED','Result cannot be represented by the supported set subset.')


def sets(args):
    operation=args['operation'];a=decode_set(args['set'])
    if operation in ('union','intersection','difference'):
        if 'other' not in args:raise ToolError('INVALID_ARGUMENT','Binary set operation requires other.')
        if 'universe' in args:raise ToolError('INVALID_ARGUMENT','universe is only used by complement.')
        b=decode_set(args['other']);value={'union':sp.Union,'intersection':sp.Intersection,'difference':sp.Complement}[operation](a,b)
    elif operation=='complement':
        if 'universe' not in args or 'other' in args:raise ToolError('INVALID_ARGUMENT','Complement requires an explicit universe, not other.')
        universe=decode_set(args['universe'])
        if a.is_subset(universe) is not True:raise ToolError('DOMAIN_ERROR','The set must be provably contained in its declared universe.')
        value=sp.Complement(universe,a)
    elif operation=='normalize':
        if 'other' in args or 'universe' in args:raise ToolError('INVALID_ARGUMENT','Unused set operands.')
        value=a
    else:raise ToolError('UNSUPPORTED','Unknown set operation.')
    result=dict(kind='set',ir=encode_set(value),irVersion=1,expression=str(value),representation='exact',
                domain={'declared':'real','conditions':[],'exclusions':[],'analysisComplete':True})
    return value_result(result,[math_view(value)],{'engine':'SymPy','version':sp.__version__})
