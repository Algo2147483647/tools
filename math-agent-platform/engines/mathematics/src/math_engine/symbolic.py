import math, warnings
import sympy as sp
import numpy as np
from .common import *
def symbolic(args):
    op=args['operation'];domain=args.get('domain','real');x=symbol(args.get('variable','x'),domain)
    from .ir import parse,lower,encode
    from .domains import analyze,filter_solutions
    tree=parse(args['expression'],args.get('format','ascii'))
    constraints,domain_info=analyze(tree,domain)
    parsed=lower(tree,domain)
    if tree['kind']=='Matrix':raise ToolError('UNSUPPORTED','Use structure_math to parse matrices.')
    if tree['kind']=='Equation' and op!='solve':raise ToolError('INVALID_ARGUMENT','Equations require solve.')
    expr=parsed.lhs-parsed.rhs if tree['kind']=='Equation' else parsed
    checks=[];notes=[]
    assumptions=['Symbols are '+domain+'.']+domain_info['conditions']
    if op in ('simplify','expand','factor'):result={'simplify':sp.simplify,'expand':sp.expand,'factor':sp.factor}[op](expr);check=sp.simplify(expr-result)==0;checks=[{'name':'symbolic equivalence','passed':check}]
    elif op=='differentiate':result=sp.diff(expr,x,args.get('order',1))
    elif op=='integrate':
        if args.get('interval') is not None:
            a,b=exact_interval(args);result=sp.integrate(expr,(x,a,b))
            if any(isinstance(v, float) for v in args['interval']): notes.append('Numeric JSON endpoints use their received decimal representation; supply strings for original exact literals.')
        else:
            result=sp.integrate(expr,x);notes.append('Indefinite integral is reported without the arbitrary additive constant.')
            if not result.has(sp.Integral):checks=[{'name':'differentiate antiderivative','passed':sp.simplify(sp.diff(result,x)-expr)==0}]
    elif op=='limit':
        point=args.get('point','0');point=sp.oo if point=='inf' else -sp.oo if point=='-inf' else expression(point,domain)
        if point.free_symbols:raise ToolError('INVALID_ARGUMENT','Limit point must be constant.')
        result=sp.limit(expr,x,point,dir=args.get('direction','+'))
    elif op=='solve':
        if expr.free_symbols-{x}:raise ToolError('INVALID_ARGUMENT','This solver accepts one variable; substitute other symbols first.')
        result=sp.solveset(expr,x,domain=sp.S.Reals if domain=='real' else sp.S.Complexes)
        result=filter_solutions(result,constraints,x,domain)
        if isinstance(result,sp.FiniteSet):
            checks=[{'name':'substitution '+str(v),'passed':sp.simplify(expr.subs(x,v))==0} for v in result]
        status='unresolved' if result.has(sp.ConditionSet) else 'no_solution' if result is sp.S.EmptySet else 'solved'
        return value_result({'kind':'solution_set','expression':str(result),'latex':sp.latex(result),'state':status,'variable':str(x),'domain':domain_info,'inputIR':tree,'irVersion':1},[math_view(result,'Solution set')],{'engine':'SymPy','version':sp.__version__},checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Substitution of returned finite roots only; completeness is solver-reported.',checks),assumptions)
    else:raise ToolError('UNSUPPORTED','Unsupported symbolic operation.')
    unresolved=result.has(sp.Integral,sp.Derivative,sp.Limit)
    if unresolved:notes.append('The symbolic engine returned an unevaluated expression.')
    try: result_ir=encode(result)
    except ToolError: result_ir=None
    return value_result({'inputIR':tree,'ir':result_ir,'irVersion':1,'domain':domain_info,'kind':'expression','expression':str(result),'latex':sp.latex(result),'exact':not result.has(sp.Float),'state':'unresolved' if unresolved else 'computed'},[math_view(result)],{'engine':'SymPy','version':sp.__version__},checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Symbolic consistency checks use the same engine, not an independent proof.',checks),assumptions,notes)

