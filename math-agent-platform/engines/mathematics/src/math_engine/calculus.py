"""Multivariable derivatives and explicit-order improper/piecewise integrals."""
import math
import warnings
import sympy as sp
import numpy as np
from .ir import parse,lower,encode
from .domains import analyze
from .common import ToolError,value_result,checked,symbol
from .precision import PrecisionPolicy,check_status
from .equations import packed


def calculus(args):
    op=args['operation'];names=args.get('variables',['x']);variables=[symbol(n) for n in names]
    if len(set(names))!=len(names):raise ToolError('INVALID_ARGUMENT','Derivative variables must be distinct.')
    constraints=[];domain=dict(declared='real',conditions=[],exclusions=[],analysisComplete=True)
    def read(text):
        tree=parse(text,args.get('format','ascii'));conditions,info=analyze(tree);constraints.extend(conditions)
        domain['conditions']=list(dict.fromkeys(domain['conditions']+info['conditions']));domain['exclusions']=list(dict.fromkeys(domain['exclusions']+info['exclusions']));domain['analysisComplete'] &= info['analysisComplete']
        expr=lower(tree)
        if isinstance(expr,sp.Equality):expr=expr.lhs-expr.rhs
        if not isinstance(expr,sp.Expr):raise ToolError('INVALID_ARGUMENT','Calculus requires scalar expressions.')
        if expr.free_symbols-set(variables):raise ToolError('INVALID_ARGUMENT','Declare every calculus variable.')
        return tree,expr
    checks=[];notes=[]
    if op in ('partial','gradient','jacobian','hessian','implicit_derivative'):
        if ('expression' in args)==('expressions' in args):raise ToolError('INVALID_ARGUMENT','Supply exactly one of expression or expressions.')
        if any(k in args for k in ('limits','segments','precision','tolerance')) or args.get('mode','symbolic')!='symbolic':raise ToolError('INVALID_ARGUMENT','Derivative operations are symbolic; use verifyAt for a local cross-check.')
        if 'orders' in args and op!='partial':raise ToolError('INVALID_ARGUMENT','orders applies only to partial derivatives.')
        texts=args.get('expressions') or ([args['expression']] if 'expression' in args else [])
        if not texts or op!='jacobian' and len(texts)!=1:raise ToolError('INVALID_ARGUMENT','Only Jacobian accepts multiple expressions.')
        parsed=[read(text) for text in texts];exprs=[v for _,v in parsed];f=exprs[0]
        if op=='partial':
            orders=args.get('orders',[1]+[0]*(len(variables)-1))
            if len(orders)!=len(variables) or not 1<=sum(orders)<=5:raise ToolError('INVALID_ARGUMENT','Partial derivative orders must match variables, total 1–5.')
            value=sp.diff(f,*[(v,n) for v,n in zip(variables,orders) if n])
        elif op=='gradient':value=sp.Matrix([sp.diff(f,v) for v in variables])
        elif op=='jacobian':value=sp.Matrix(exprs).jacobian(variables)
        elif op=='hessian':value=sp.hessian(f,variables)
        else:
            if len(variables)!=2:raise ToolError('INVALID_ARGUMENT','Implicit derivative requires [independent, dependent] variables.')
            x,y=variables;denominator=sp.diff(f,y)
            if denominator==0:raise ToolError('DOMAIN_ERROR','Implicit derivative requires a nonzero dependent-variable derivative.')
            value=sp.cancel(-sp.diff(f,x)/denominator)
            domain['conditions'].append(str(sp.Ne(denominator,0,evaluate=False)))
            domain['conditions'].append(str(sp.Eq(f,0,evaluate=False)))
            passed=sp.simplify(sp.diff(f,x)+denominator*value)==0
            checks.append(dict(name='Implicit chain-rule identity',passed=bool(passed),status='passed' if passed else 'failed',evidence='symbolic_consistency'))
        result=dict(**packed(value),representation='exact',variables=names,shape=list(value.shape) if isinstance(value,sp.MatrixBase) else [],domain=domain)
        if result['ir'] is not None:
            _,output_domain=analyze(result['ir']);domain['conditions']=list(dict.fromkeys(domain['conditions']+output_domain['conditions']));domain['analysisComplete'] &= output_domain['analysisComplete']
            if domain['conditions'] or not domain['analysisComplete']:
                source=parsed[0][0]
                for tree,_ in parsed[1:]:source={'kind':'Add','args':[source,tree]}
                result['ir']={'kind':'Restricted','expression':result['ir'],'source':source}
            result['irVersion']=1
            if op=='implicit_derivative':
                result['ir']={'kind':'Conditioned','expression':result['ir'],'conditions':[
                    {'kind':'Equation','args':[encode(f),{'kind':'Integer','value':'0'}]},
                    {'kind':'Relation','relation':'!=','args':[encode(denominator),{'kind':'Integer','value':'0'}]}]}
        else:domain['analysisComplete']=False
        if 'verifyAt' in args:
            point=args['verifyAt']
            if len(point)!=len(variables):raise ToolError('INVALID_ARGUMENT','verifyAt must match variable order.')
            p=np.asarray(point,dtype=float);assignment=dict(zip(variables,p))
            if any(sp.simplify(c.subs(assignment)) is not sp.S.true for c in constraints):raise ToolError('DOMAIN_ERROR','Verification point does not satisfy the original domain.')
            if op not in ('gradient','jacobian','hessian'):raise ToolError('UNSUPPORTED','Finite-difference verification supports gradient, Jacobian and Hessian.')
            refexprs=[sp.diff(f,v) for v in variables] if op=='hessian' else exprs
            estimates=np.empty((len(refexprs),len(variables)))
            for j,v in enumerate(variables):
                step=np.cbrt(np.finfo(float).eps)*max(1.,abs(p[j]));plus=dict(assignment);minus=dict(assignment);plus[v]+=step;minus[v]-=step
                if any(sp.simplify(c.subs(q)) is not sp.S.true for c in constraints for q in (plus,minus)):raise ToolError('DOMAIN_ERROR','Finite-difference stencil crosses the original domain.')
                for i,expr in enumerate(refexprs):estimates[i,j]=(float(expr.subs(plus))-float(expr.subs(minus)))/(2*step)
            actual=np.array(value.subs(assignment).tolist(),dtype=float)
            if op=='gradient':actual=actual.T
            error=float(np.linalg.norm(actual-estimates));scale=float(np.linalg.norm(actual))
            check=PrecisionPolicy(absoluteTolerance=1e-5,relativeTolerance=1e-5).check('Central finite-difference cross-check',error,scale,'heuristic_cross_check');checks.append(check)
            notes.append('Finite differences are a local heuristic cross-check, not a proof of derivatives or their domain.')
        return value_result(result,verification=checked(check_status(checks),'Derivative conditions and any local cross-check are reported separately.',checks),notes=notes)

    if op not in ('integrate','piecewise_integrate'):raise ToolError('UNSUPPORTED','Unknown calculus operation.')
    if any(k in args for k in ('expressions','orders','verifyAt')):raise ToolError('INVALID_ARGUMENT','Unused derivative arguments on integration.')
    if op=='integrate' and 'segments' in args or op=='piecewise_integrate' and any(k in args for k in ('expression','limits')):raise ToolError('INVALID_ARGUMENT','Use limits for integrate or segments for piecewise_integrate.')
    if args.get('mode','symbolic')=='symbolic' and any(k in args for k in ('precision','tolerance')):raise ToolError('INVALID_ARGUMENT','Numeric precision settings do not apply to symbolic integration.')
    def endpoint(text,allowed):
        if text in ('inf','-inf'):return sp.oo if text=='inf' else -sp.oo
        tree=parse(str(text));conditions,info=analyze(tree);constraints.extend(conditions)
        domain['conditions']=list(dict.fromkeys(domain['conditions']+info['conditions']));domain['analysisComplete'] &= info['analysisComplete']
        expr=lower(tree)
        if not isinstance(expr,sp.Expr) or expr.free_symbols-set(allowed):raise ToolError('INVALID_ARGUMENT','Integration bounds may depend only on later integration variables.')
        if expr.is_real is False:raise ToolError('DOMAIN_ERROR','Integration bounds must be real.')
        return expr
    if op=='piecewise_integrate':
        if len(variables)!=1 or not args.get('segments'):raise ToolError('INVALID_ARGUMENT','Piecewise integration requires one variable and segments.')
        pieces=[];previous=None
        for segment in args['segments']:
            start=len(constraints);_,expr=read(segment['expression']);a=endpoint(segment['lower'],[]);b=endpoint(segment['upper'],[]);local_conditions=constraints[start:]
            if (a<b) is not sp.S.true or previous is not None and (a>=previous) is not sp.S.true:raise ToolError('INVALID_ARGUMENT','Segments must be increasing, nonoverlapping and ordered.')
            pieces.append((expr,[(variables[0],a,b)],local_conditions));previous=b
        domain['conditions']=[f'segment[{i}]: {c}' for i,(_,_,cs) in enumerate(pieces) for c in cs]
        domain['exclusions']=[]
    else:
        if 'expression' not in args:raise ToolError('INVALID_ARGUMENT','Supply an integrand.')
        _,expr=read(args['expression']);limits=args.get('limits',[])
        if not limits or [v['variable'] for v in limits]!=names:raise ToolError('INVALID_ARGUMENT','limits must follow variables in innermost-to-outermost order.')
        bounds=[]
        for i,entry in enumerate(limits):
            a=endpoint(entry['lower'],variables[i+1:]);b=endpoint(entry['upper'],variables[i+1:])
            if not (a.free_symbols|b.free_symbols) and (a<b) is not sp.S.true:raise ToolError('INVALID_ARGUMENT','Constant bounds must be increasing.')
            bounds.append((variables[i],a,b))
        pieces=[(expr,bounds,list(constraints))]
    mode=args.get('mode','symbolic');total=sp.S.Zero;stages=[];unknown=False;numeric_error=0.;policy=PrecisionPolicy.from_arguments(args)
    for expr,bounds,piece_conditions in pieces:
        if mode=='numeric':
            if len(bounds)!=1:raise ToolError('UNSUPPORTED','Certified total error propagation for numerical multiple integrals is unavailable; use symbolic iterated integration.')
            from scipy.integrate import quad
            x,a,b=bounds[0]
            if expr.free_symbols-{x}:raise ToolError('INVALID_ARGUMENT','Numerical integration requires a fully specified integrand.')
            def fn(v):
                assignment={x:v}
                if any(c.free_symbols <= {x} and sp.simplify(c.subs(assignment)) is not sp.S.true for c in piece_conditions):raise ToolError('DOMAIN_ERROR','Numerical integrand violates its original domain.')
                result=float(expr.subs(x,v))
                if not math.isfinite(result):raise ToolError('DOMAIN_ERROR','Non-finite integrand value.')
                return result
            singular=sp.singularities(expr,x,domain=sp.S.Reals)
            if not isinstance(singular,sp.FiniteSet) and singular is not sp.S.EmptySet:raise ToolError('UNSUPPORTED','Singularity set could not be enumerated.')
            cuts=[a]+sorted([p for p in singular if (a<p) is sp.S.true and (p<b) is sp.S.true],key=float)+[b]
            for left,right in zip(cuts,cuts[1:]):
                with warnings.catch_warnings(record=True) as caught:
                    warnings.simplefilter('always');value,error=quad(fn,float(left),float(right),epsabs=policy.absoluteTolerance/max(1,len(pieces)*(len(cuts)-1)),epsrel=policy.relativeTolerance,limit=policy.maxIterations)
                if caught:raise ToolError('NOT_CONVERGED','Quadrature warned about convergence; no finite integral is asserted.')
                total+=sp.Float(value);numeric_error+=error
            unknown=True;continue
        value=expr
        for x,a,b in bounds:
            if not (a.free_symbols|b.free_symbols) and all(c.free_symbols <= {x} for c in piece_conditions):
                try:
                    allowed=sp.reduce_inequalities(piece_conditions,x).as_set() if piece_conditions else sp.S.Reals
                    missing=sp.Complement(sp.Interval.open(a,b),allowed)
                    if missing.measure.is_positive is True:raise ToolError('DOMAIN_ERROR','Integrand is undefined on a nonzero-length part of the integration interval.')
                    if missing.measure.is_zero is not True:unknown=True
                except (NotImplementedError,ValueError):unknown=True
            elif piece_conditions:unknown=True
            # Split constant interior singularities so opposite infinities never cancel.
            singular=sp.singularities(value,x,domain=sp.S.Reals)
            cuts=[a,b]
            if not (value.free_symbols-{x}) and not (a.free_symbols|b.free_symbols):
                if isinstance(singular,sp.FiniteSet):cuts=[a]+sorted([p for p in singular if (a<p) is sp.S.true and (p<b) is sp.S.true],key=sp.default_sort_key)+[b]
                elif singular is not sp.S.EmptySet:unknown=True
            elif singular is not sp.S.EmptySet:unknown=True
            contributions=[sp.integrate(value,(x,l,r)) for l,r in zip(cuts,cuts[1:])]
            stages.append(dict(variable=str(x),bounds=[str(a),str(b)],contributions=[str(v) for v in contributions]))
            if any(not v.has(sp.Integral,sp.Piecewise,sp.AccumBounds) and v.has(sp.oo,-sp.oo,sp.zoo) for v in contributions):
                return value_result(dict(state='computed',representation='exact',convergence='divergent',value=None,stages=stages,domain=domain),notes=['Ordinary improper integral; no Cauchy principal-value cancellation is used.'])
            value=sum(contributions,sp.S.Zero)
            if value.has(sp.Integral,sp.Piecewise,sp.AccumBounds,sp.nan) or value.is_finite is not True:unknown=True
        total+=value
    result=dict(**packed(total),representation='approximate' if mode=='numeric' else 'exact',convergence='unknown' if unknown else 'convergent',
                convergenceSource='not_certified' if mode=='numeric' else 'symbolic_backend',integrationOrder=names,stages=stages,domain=domain)
    if total.has(sp.Integral):result['state']='unresolved'
    elif unknown and mode=='symbolic':result['state']='partial'
    if mode=='numeric':
        check=policy.check('Accumulated quadrature error estimate',numeric_error,abs(float(total)),'estimated_error');checks.append(check)
        result['estimatedAbsoluteError']=numeric_error;result['errorBoundKind']='estimated'
        notes.append('A finite quadrature estimate does not establish convergence. Error estimates are not strict bounds.')
    return value_result(result,verification=checked(check_status(checks),'Integration convergence and numeric error estimates are distinct.',checks),notes=notes)
