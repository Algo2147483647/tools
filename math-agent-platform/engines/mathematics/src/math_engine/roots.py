"""Exact polynomial root coverage and explicitly incomplete numerical searches."""
import math
import sympy as sp
import numpy as np
from scipy import optimize
from .common import ToolError,expression,symbol,numeric_function,interval,value_result,checked
from .precision import PrecisionPolicy,check_status


def roots(args):
    policy=PrecisionPolicy.from_arguments(args);op=args['operation'];checks=[]
    if op=='system_root':
        names=args.get('variables',[]);variables=[symbol(n) for n in names];texts=args.get('expressions',[]);guess=args.get('initialGuess',[])
        if not names or len(set(names))!=len(names) or len(texts)!=len(names) or len(guess)!=len(names):raise ToolError('INVALID_ARGUMENT','Supply equally sized variables, expressions and initialGuess.')
        from .ir import parse,lower
        from .domains import analyze
        exprs=[];conditions=[]
        for source in texts:
            tree=parse(source);cs,_=analyze(tree);conditions.extend(cs);expr=lower(tree)
            if not isinstance(expr,sp.Expr) or expr.free_symbols-set(variables):raise ToolError('INVALID_ARGUMENT','System expressions must use only declared variables.')
            exprs.append(expr)
        def fn(values):
            substitutions=dict(zip(variables,values))
            if any(sp.simplify(c.subs(substitutions)) is not sp.S.true for c in conditions):raise ToolError('DOMAIN_ERROR','Root search left the original domain.')
            result=np.array([float(v.subs(substitutions)) for v in exprs])
            if not np.isfinite(result).all():raise ToolError('DOMAIN_ERROR','Non-finite system evaluation.')
            return result
        scale=max(1.,float(np.linalg.norm(fn(guess))))
        found=optimize.root(fn,guess,method='hybr',options={'xtol':policy.absoluteTolerance,'maxfev':policy.maxIterations})
        residual=float(np.linalg.norm(fn(found.x)));checks=[policy.check('System root residual',residual,scale)]
        return value_result(dict(values=found.x.tolist(),variables=names,representation='approximate',completeness='unknown',state='computed' if found.success and checks[0]['passed'] else 'partial'),
                            diagnostics=dict(method='hybr',converged=bool(found.success),evaluations=int(found.nfev),residual=residual,precision=policy.diagnostics()),
                            verification=checked(check_status(checks),'One local candidate; uniqueness and global completeness are not certified.',checks))
    expr=expression(args['expression']);x=symbol(args.get('variable','x'));a,b=interval(args)
    from .ir import parse
    from .domains import analyze
    original_conditions,_=analyze(parse(args['expression']))
    if expr.free_symbols-{x}:raise ToolError('INVALID_ARGUMENT','Only one search variable is allowed.')
    try:
        if any(p.exp.is_Integer and abs(p.exp)>20 for p in expr.atoms(sp.Pow)):raise ToolError('RESOURCE_LIMIT','Polynomial exponent budget exceeded.')
        polynomial=sp.Poly(expr,x,domain='QQ')
    except (sp.PolynomialError,sp.polys.polyerrors.CoercionFailed):polynomial=None
    if polynomial is not None and not original_conditions:
        if polynomial.is_zero:return value_result(dict(solutionKind='interval',interval=[str(a),str(b)],representation='exact',completeness='complete',warnings=['Every point in the interval is a root.']))
        if polynomial.degree()>20:raise ToolError('RESOURCE_LIMIT','Root isolation degree exceeds 20.')
        bounds=polynomial.intervals(eps=sp.Rational(str(policy.absoluteTolerance)),inf=sp.Rational(str(a)),sup=sp.Rational(str(b)))
        result=dict(roots=[dict(interval=[str(l),str(r)],multiplicity=m,approximation=str((l+r)/2),certified=True) for (l,r),m in bounds],
                    representation='enclosure',completeness='complete',scope='All real polynomial roots within the supplied closed interval.')
        return value_result(result,diagnostics=dict(method='exact rational polynomial isolation',coefficientDomain='QQ'),
                            verification=checked('passed','Exact polynomial isolation; approximations are interval midpoints.',[dict(name='Isolating intervals',passed=True,status='passed',evidence='exact_root_isolation')]))
    fn=numeric_function(expr,x,args['expression']);grid=np.linspace(a,b,args.get('samples',200));found=[];unresolved=[]
    def scalar(t):
        value=float(fn(t))
        if not math.isfinite(value):raise ValueError('Outside domain')
        return value
    for left,right in zip(grid,grid[1:]):
        try:
            fl,fr=scalar(left),scalar(right)
            if fl==0:candidate=float(left)
            elif fr==0:candidate=float(right)
            elif np.signbit(fl)!=np.signbit(fr):candidate=float(optimize.brentq(scalar,left,right,xtol=policy.absoluteTolerance,rtol=policy.relativeTolerance,maxiter=policy.maxIterations))
            else:unresolved.append([float(left),float(right)]);continue
            residual=abs(scalar(candidate));check=policy.check('Candidate root residual',residual,max(abs(fl),abs(fr)))
            if not check['passed']:unresolved.append([float(left),float(right)]);continue
            if not any(abs(candidate-v['value'])<=policy.threshold(candidate) for v in found):found.append(dict(value=candidate,residual=residual,bracket=[float(left),float(right)]));checks.append(check)
        except (ValueError,RuntimeError,ZeroDivisionError,ToolError):unresolved.append([float(left),float(right)])
    return value_result(dict(roots=found,unresolvedIntervals=unresolved,representation='approximate',completeness='partial',state='partial'),
                        diagnostics=dict(method='scan plus brentq',samples=len(grid),precision=policy.diagnostics()),
                        verification=checked(check_status(checks),'Residual checks only; sign scans can miss even-multiplicity or multiple roots.',checks),
                        notes=['Even searched brackets are not certificates of uniqueness or continuity. No full-root claim is made.'])
