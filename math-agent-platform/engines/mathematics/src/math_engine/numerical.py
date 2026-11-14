import math, warnings
import sympy as sp
import numpy as np
from .common import *
def numeric(args):
    from scipy import optimize,integrate,linalg
    op=args['operation'];tol=number(args.get('tolerance',1e-8));notes=[]
    if not 1e-12<=tol<=1e-2:raise ToolError('INVALID_ARGUMENT','Tolerance must be between 1e-12 and 1e-2.')
    diagnostics={'engine':'SciPy/NumPy','tolerance':tol};checks=[]
    if op in ('linear_solve','eigenvalues'):
        a=np.asarray(args.get('matrix'),dtype=float)
        if a.ndim!=2 or a.shape[0]!=a.shape[1] or not 1<=a.shape[0]<=50 or not np.isfinite(a).all():raise ToolError('INVALID_ARGUMENT','Supply a finite square matrix of size 1–50.')
        if op=='linear_solve':
            b=np.asarray(args.get('vector'),dtype=float)
            if b.shape!=(a.shape[0],) or not np.isfinite(b).all():raise ToolError('INVALID_ARGUMENT','Vector length must match the matrix.')
            v=linalg.solve(a,b);residual=float(linalg.norm(a@v-b));condition=float(np.linalg.cond(a));diagnostics.update(residual=residual,conditionNumber=condition if np.isfinite(condition) else None)
            if condition>1e10:notes.append('The matrix is ill-conditioned; small input changes may strongly affect the solution.')
            checks=[{'name':'linear residual','passed':residual<=tol*max(1,float(linalg.norm(b)))}]
            result={'kind':'vector','values':[float(x) for x in v],'exact':False};view=table_view(['Index','Value'],[[i,float(x)] for i,x in enumerate(v)],'Linear solution')
        else:
            values=linalg.eigvals(a);result={'kind':'vector','values':[{'real':float(v.real),'imag':float(v.imag)} for v in values],'exact':False};view=table_view(['Real','Imaginary'],[[float(v.real),float(v.imag)] for v in values],'Eigenvalues')
        return value_result(result,[view],diagnostics,checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Numerical residual only.',checks),notes=notes)
    expr=expression(args['expression']);x=symbol(args.get('variable','x'));fn=numeric_function(expr,x);a,b=interval(args)
    def scalar(v):
        out=float(fn(v))
        if not math.isfinite(out):raise ToolError('DOMAIN_ERROR','Non-finite value encountered in the requested interval.')
        return out
    if op=='root':
        root,info=optimize.brentq(scalar,a,b,xtol=tol,full_output=True,maxiter=200,disp=False);residual=abs(scalar(root));diagnostics.update(converged=bool(info.converged),iterations=0 if root in (a,b) else int(info.iterations),residual=residual,method='brentq')
        if not info.converged or residual>tol*10:raise ToolError('NOT_CONVERGED','Root finding did not satisfy the residual tolerance; check continuity and the bracket.')
        value=root;checks=[{'name':'root residual','passed':True}]
    elif op=='integrate':
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always');value,estimate=integrate.quad(scalar,a,b,epsabs=tol,epsrel=tol,limit=100)
        if caught or estimate>max(tol,tol*abs(value))*2:raise ToolError('NOT_CONVERGED','Integration did not meet the error target; split the interval or inspect singularities.')
        diagnostics.update(estimatedAbsoluteError=estimate,method='quad',converged=True);checks=[{'name':'estimated integration error','passed':True}]
    elif op=='minimize':
        info=optimize.minimize_scalar(scalar,bounds=(a,b),method='bounded',options={'xatol':tol,'maxiter':500})
        if not info.success:raise ToolError('NOT_CONVERGED','Bounded minimization did not converge.')
        value=float(info.x);diagnostics.update(method='bounded',converged=True,functionValue=float(info.fun),iterations=int(info.nit));notes.append('Bounded local search; a global minimum is not certified. Endpoints are not automatically selected.')
    else:raise ToolError('UNSUPPORTED','Unsupported numeric operation.')
    return value_result({'kind':'scalar','value':str(value),'exact':False},[math_view(sp.Float(value,15),'Numerical result')],diagnostics,checked('passed' if checks else 'not_checked','Floating-point numerical checks, not an exact proof.',checks),['Real-valued function on the supplied interval.'],notes)

