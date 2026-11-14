"""Bounded exact algebra over QQ; all results retain source-domain restrictions."""
import sympy as sp
from sympy.polys.numberfields import to_number_field
from .ir import parse,lower,encode,node,input_tree
from .domains import analyze
from .common import ToolError,value_result,math_view,checked


def same_algebraic(a,b):return all(c==0 for c in to_number_field(a-b).coeffs())


def polynomial_degree_budget(expr,limit=20):
    """Reject degree growth before asking a backend to expand the expression."""
    if not expr.free_symbols:return 0
    if expr.is_Symbol:return 1
    if expr.is_Add:degree=max(polynomial_degree_budget(v,limit) for v in expr.args)
    elif expr.is_Mul:degree=sum(polynomial_degree_budget(v,limit) for v in expr.args)
    elif expr.is_Pow and expr.exp.is_Integer and expr.exp>=0:degree=polynomial_degree_budget(expr.base,limit)*int(expr.exp)
    else:raise ToolError('INVALID_ARGUMENT','Expected a polynomial expression.')
    if degree>limit:raise ToolError('RESOURCE_LIMIT',f'Polynomial structural degree exceeds {limit} before expansion.')
    return degree


def algebraic_descriptor(value):
    degree_bound=1
    for power in value.atoms(sp.Pow):
        if power.exp.is_Rational:degree_bound*=int(power.exp.q)
        if degree_bound>16:raise ToolError('RESOURCE_LIMIT','Algebraic extension budget exceeds 16 before minimal-polynomial computation.')
    value=sp.simplify(value)
    if value.free_symbols or value.is_algebraic is not True or value.is_real is not True:
        raise ToolError('UNSUPPORTED','This interface accepts finite real algebraic constants only.')
    z=sp.Symbol('z');p=sp.Poly(sp.minpoly(value,z),z,domain='QQ').clear_denoms()[1].primitive()[1]
    if p.degree()>16:raise ToolError('RESOURCE_LIMIT','Algebraic degree exceeds 16.')
    roots=sp.polys.polytools.real_roots(p,radicals=False)
    index=next((i for i,r in enumerate(roots) if same_algebraic(value,r)),None)
    if index is None:raise ToolError('VERIFICATION_FAILED','Could not identify the algebraic root exactly.')
    intervals=p.intervals(eps=sp.Rational(1,1000));bounds=intervals[index][0]
    ir=node('Algebraic',polynomial=[str(c) for c in p.all_coeffs()],realRootIndex=index)
    return ir,{'minimalPolynomial':str(p.as_expr()),'variable':'z','isolatingInterval':[str(b) for b in bounds],
               'rootOrder':'increasing distinct real roots','exact':True}


def algebra(args):
    op=args['operation'];domain=args.get('domain','real')
    tree=input_tree(args);constraints,info=analyze(tree,domain)
    a=lower(tree,domain)
    if not isinstance(a,sp.Expr):raise ToolError('INVALID_ARGUMENT','A scalar expression is required.')
    binary=op in ('algebraic_add','algebraic_subtract','algebraic_multiply','algebraic_divide','algebraic_equal','divide','gcd','resultant')
    if (('other' in args) or ('otherIR' in args))!=binary:raise ToolError('INVALID_ARGUMENT','other or otherIR is required only for binary operations.')
    b=None
    if binary:
        other=input_tree(args,'other','otherIR');_,other_info=analyze(other,domain);b=lower(other,domain)
        if not isinstance(b,sp.Expr):raise ToolError('INVALID_ARGUMENT','A scalar expression is required.')
        info['conditions']=list(dict.fromkeys(info['conditions']+other_info['conditions']))
        info['exclusions']=list(dict.fromkeys(info['exclusions']+other_info['exclusions']))
        info['analysisComplete'] &= other_info['analysisComplete']
    checks=[];result={'inputIR':tree,'irVersion':1,'domain':info,'representation':'exact'};views=[]
    def check(name,passed):checks.append({'name':name,'passed':bool(passed),'status':'passed' if passed else 'failed','evidence':'exact_algebra'})
    if op=='radical_simplify':
        value=sp.radsimp(sp.simplify(a));result.update(expression=str(value),ir=encode(value));views=[math_view(value)]
        _,output_info=analyze(result['ir'],domain)
        info['conditions']=list(dict.fromkeys(info['conditions']+output_info['conditions']))
        info['exclusions']=list(dict.fromkeys(info['exclusions']+output_info['exclusions']))
        info['analysisComplete'] &= output_info['analysisComplete']
        check('Symbolic identity on retained domain',sp.simplify(value-a)==0)
    elif op.startswith('algebraic_') or op=='minimal_polynomial':
        a=sp.simplify(a);algebraic_descriptor(a)
        if b is not None:b=sp.simplify(b);algebraic_descriptor(b)
        if op=='algebraic_equal':
            result.update(equal=same_algebraic(a,b),kind='comparison')
        else:
            if op=='algebraic_divide' and same_algebraic(b,0):raise ToolError('DOMAIN_ERROR','Division by zero.')
            value={'algebraic_add':lambda:a+b,'algebraic_subtract':lambda:a-b,'algebraic_multiply':lambda:a*b,
                   'algebraic_divide':lambda:a/b}.get(op,lambda:a)()
            ir,metadata=algebraic_descriptor(value);result.update(ir=ir,algebraic=metadata,expression=str(sp.simplify(value)))
            check('Exact algebraic root identification',same_algebraic(lower(ir),value))
            views=[math_view(sp.simplify(value))]
    else:
        names=args.get('variables',['x'])
        if len(names)!=len(set(names)) or any(n in ('pi','E') for n in names):raise ToolError('INVALID_ARGUMENT','Polynomial variables must be distinct symbols.')
        variables=[sp.Symbol(n,real=True) if domain=='real' else sp.Symbol(n) for n in names]
        coefficient_domain=args.get('coefficientDomain','QQ')
        def polynomial(expr):
            def degree_budget(e):
                if not e.free_symbols:return 0
                if e.is_Symbol:return 1
                degrees=[degree_budget(v) for v in e.args]
                if e.is_Add:degree=max(degrees)
                elif e.is_Mul:degree=sum(degrees)
                elif e.is_Pow and e.exp.is_Integer and e.exp>=0:degree=degrees[0]*int(e.exp)
                else:raise ToolError('INVALID_ARGUMENT','Expected a polynomial expression.')
                if degree>20:raise ToolError('RESOURCE_LIMIT','Polynomial structural degree exceeds 20 before expansion.')
                return degree
            degree_budget(expr)
            if any(power.exp.is_Integer and abs(power.exp)>20 for power in expr.atoms(sp.Pow)):
                raise ToolError('RESOURCE_LIMIT','Polynomial exponent exceeds 20.')
            try:p=sp.Poly(expr,*variables,domain=coefficient_domain)
            except (sp.PolynomialError,sp.polys.polyerrors.CoercionFailed):raise ToolError('INVALID_ARGUMENT','Expected a polynomial in the declared variables and coefficient domain.')
            if p.total_degree()>20 or len(p.terms())>200:raise ToolError('RESOURCE_LIMIT','Polynomial degree/term budget exceeded.')
            if any(max(int(c.p).bit_length(),int(c.q).bit_length())>4096 for c in p.coeffs()):
                raise ToolError('RESOURCE_LIMIT','Polynomial coefficients exceed 4096 bits.')
            return p
        p=polynomial(a);q=polynomial(b) if b is not None else None
        result.update(variables=names,coefficientDomain=coefficient_domain)
        if op=='divide':
            if q.is_zero:raise ToolError('DOMAIN_ERROR','Polynomial division by zero.')
            quotient,remainder=sp.div(p,q,auto=False)
            leading=q.monoms()[0]
            reduced=all(not all(a>=b for a,b in zip(monomial,leading)) for monomial in remainder.monoms()) if not remainder.is_zero else True
            if not reduced:raise ToolError('UNSUPPORTED','Division in this coefficient ring cannot produce a reduced remainder; explicitly select QQ.')
            result.update(quotient=encode(quotient.as_expr()),remainder=encode(remainder.as_expr()))
            check('Dividend equals quotient times divisor plus remainder',p==quotient*q+remainder)
            check('Remainder monomials are not divisible by the divisor leading monomial',reduced)
        elif op=='gcd':
            value=sp.gcd(p,q);result.update(ir=encode(value.as_expr()),expression=str(value.as_expr()))
            check('GCD divides both operands',value.is_zero and p.is_zero and q.is_zero or not value.is_zero and p.rem(value).is_zero and q.rem(value).is_zero)
        elif op in ('factor','square_free'):
            coefficient,factors=p.factor_list() if op=='factor' else p.sqf_list()
            result.update(coefficient=encode(coefficient),factors=[dict(polynomial=encode(f.as_expr()),multiplicity=m) for f,m in factors])
            check('Factor product equals original polynomial',sp.expand(coefficient*sp.prod(f.as_expr()**m for f,m in factors)-p.as_expr())==0)
        elif op=='resultant':
            eliminate=args.get('eliminate',names[0])
            if eliminate not in names:raise ToolError('INVALID_ARGUMENT','Elimination variable must be declared.')
            v=variables[names.index(eliminate)];value=sp.resultant(p.as_expr(),q.as_expr(),v)
            result.update(ir=encode(value),expression=str(value),eliminated=eliminate)
        elif op=='isolate_roots':
            if len(variables)!=1 or p.is_zero:raise ToolError('INVALID_ARGUMENT','Root isolation requires a nonzero univariate polynomial.')
            intervals=p.intervals(eps=sp.Rational(1,1000))
            result.update(roots=[dict(interval=[str(l),str(r)],multiplicity=m) for (l,r),m in intervals],
                          completeness='complete',scope='all real roots')
            check('Intervals each contain one distinct real root',all((p.eval(l)==0 if l==r else p.count_roots(l,r)==1) for (l,r),m in intervals))
        else:raise ToolError('UNSUPPORTED','Unknown algebra operation.')
    if any(not c['passed'] for c in checks):raise ToolError('VERIFICATION_FAILED','Exact algebra verification failed.')
    if 'ir' in result and (info['conditions'] or not info['analysisComplete']):
        source=node('Multiply',args=[tree,other]) if binary else tree
        result['ir']=node('Restricted',expression=result['ir'],source=source)
    return value_result(result,views,{'engine':'SymPy','version':sp.__version__},
                        checked('passed' if checks else 'not_checked','Exact algebra checks use the same backend; domain conditions are retained.',checks),info['conditions'])
