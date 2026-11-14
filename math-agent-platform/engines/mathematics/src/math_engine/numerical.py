import math, warnings
import sympy as sp
import numpy as np
from .common import *
from .precision import PrecisionPolicy, check_status
def numeric(args):
    from scipy import optimize,integrate,linalg
    op=args['operation'];policy=PrecisionPolicy.from_arguments(args);tol=policy.absoluteTolerance;notes=[]
    diagnostics={'engine':'SciPy/NumPy','tolerance':tol,'precision':policy.diagnostics()};checks=[]
    if op in ('linear_solve','eigenvalues'):
        a=np.asarray(args.get('matrix'),dtype=float)
        if a.ndim!=2 or a.shape[0]!=a.shape[1] or not 1<=a.shape[0]<=50 or not np.isfinite(a).all():raise ToolError('INVALID_ARGUMENT','Supply a finite square matrix of size 1–50.')
        if op=='linear_solve':
            b=np.asarray(args.get('vector'),dtype=float)
            if b.shape!=(a.shape[0],) or not np.isfinite(b).all():raise ToolError('INVALID_ARGUMENT','Vector length must match the matrix.')
            v=linalg.solve(a,b);residual=float(linalg.norm(a@v-b));condition=float(np.linalg.cond(a));diagnostics.update(residual=residual,conditionNumber=condition if np.isfinite(condition) else None)
            if condition>1e10:notes.append('The matrix is ill-conditioned; small input changes may strongly affect the solution.')
            scale=float(linalg.norm(a)*linalg.norm(v)+linalg.norm(b))
            diagnostics['normalizedBackwardError']=residual/scale if scale else residual
            checks=[policy.check('linear residual',residual,scale)]
            result={'kind':'vector','values':[float(x) for x in v],'exact':False};view=table_view(['Index','Value'],[[i,float(x)] for i,x in enumerate(v)],'Linear solution')
        else:
            values=linalg.eigvals(a);result={'kind':'vector','values':[{'real':float(v.real),'imag':float(v.imag)} for v in values],'exact':False};view=table_view(['Real','Imaginary'],[[float(v.real),float(v.imag)] for v in values],'Eigenvalues')
        return value_result(result,[view],diagnostics,checked(check_status(checks),'Numerical residual only; no forward error bound.',checks),notes=notes)
    expr=expression(args['expression']);x=symbol(args.get('variable','x'));fn=numeric_function(expr,x);a,b=interval(args)
    def scalar(v):
        out=float(fn(v))
        if not math.isfinite(out):raise ToolError('DOMAIN_ERROR','Non-finite value encountered in the requested interval.')
        return out
    if op=='root':
        scale=max(abs(scalar(a)),abs(scalar(b)))
        root,info=optimize.brentq(scalar,a,b,xtol=tol,rtol=policy.relativeTolerance,full_output=True,maxiter=policy.maxIterations,disp=False);residual=abs(scalar(root));diagnostics.update(converged=bool(info.converged),iterations=0 if root in (a,b) else int(info.iterations),residual=residual,method='brentq',positionErrorBound=None)
        value=root;checks=[policy.check('root residual',residual,scale)]
        if not info.converged or not checks[0]['passed']:raise ToolError('NOT_CONVERGED','Root finding did not satisfy convergence and residual targets; check continuity and bracket.')
    elif op=='integrate':
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always');value,estimate=integrate.quad(scalar,a,b,epsabs=tol,epsrel=policy.relativeTolerance,limit=policy.maxIterations)
        checks=[policy.check('estimated integration error',estimate,abs(value),'estimated_error')]
        if caught or not checks[0]['passed']:raise ToolError('NOT_CONVERGED','Integration did not meet the estimated error target; split the interval or inspect singularities.')
        diagnostics.update(estimatedAbsoluteError=estimate,errorBoundKind='estimated',method='quad',converged=True)
    elif op=='minimize':
        info=optimize.minimize_scalar(scalar,bounds=(a,b),method='bounded',options={'xatol':tol,'maxiter':policy.maxIterations})
        if not info.success:raise ToolError('NOT_CONVERGED','Bounded minimization did not converge.')
        value=float(info.x);diagnostics.update(method='bounded',converged=True,functionValue=float(info.fun),iterations=int(info.nit));notes.append('Bounded local search; a global minimum is not certified. Endpoints are not automatically selected.')
    else:raise ToolError('UNSUPPORTED','Unsupported numeric operation.')
    return value_result({'kind':'scalar','value':str(value),'exact':False},[math_view(sp.Float(value,15),'Numerical result')],diagnostics,checked('passed' if checks else 'not_checked','Floating-point numerical checks, not an exact proof.',checks),['Real-valued function on the supplied interval.'],notes)

