"""Bounded equation/system solving with original-domain checks and explicit coverage."""
import itertools
import sympy as sp
from sympy.solvers.solveset import NonlinearError
from .ir import parse,lower,encode
from .domains import analyze,filter_solutions
from .common import ToolError,value_result,checked,symbol


def packed(value):
    try:ir=encode(value)
    except ToolError:ir=None
    return {'expression':str(value),'ir':ir}


def equations(args):
    op=args['operation'];names=args.get('variables',['x'])
    parameters=args.get('parameters',[])
    if len(set(names+parameters))!=len(names+parameters):raise ToolError('INVALID_ARGUMENT','Variables and parameters must be distinct.')
    variables=[symbol(n) for n in names];params=[symbol(n) for n in parameters]
    exprs=[];constraints=[];inputs=[];complete_domain=True
    def read(text):
        nonlocal complete_domain
        tree=parse(text,args.get('format','ascii'));conditions,info=analyze(tree)
        constraints.extend(conditions);complete_domain &= info['analysisComplete'];inputs.append(tree)
        value=lower(tree)
        if isinstance(value,sp.Equality):return value.lhs-value.rhs
        if not isinstance(value,sp.Expr):raise ToolError('INVALID_ARGUMENT','Scalar equations are required.')
        return value
    if op=='inequalities':
        relations=[]
        for entry in args.get('inequalities',[]):
            lhs,rhs=read(entry['left']),read(entry['right'])
            relations.append({'<':sp.Lt,'<=':sp.Le,'>':sp.Gt,'>=':sp.Ge,'!=':sp.Ne,'=':sp.Eq}[entry['relation']](lhs,rhs))
        if len(variables)!=1 or params or not relations:raise ToolError('INVALID_ARGUMENT','Inequalities require one variable and no parameters.')
        if any(r.free_symbols-set(variables) for r in relations+constraints):raise ToolError('INVALID_ARGUMENT','Undeclared inequality symbols.')
        try:solution=sp.reduce_inequalities(relations+constraints,variables[0]).as_set()
        except (NotImplementedError,ValueError):return value_result(dict(state='unresolved',representation='exact',completeness='unknown',conditions=[str(r) for r in relations+constraints]))
        return value_result(dict(kind='solution_set',**packed(solution),representation='exact',completeness='unknown',solverReportedCompleteness='complete',
                                domain=dict(declared='real',conditions=[str(c) for c in constraints],exclusions=[],analysisComplete=complete_domain)))
    for text in args.get('equations',[]):exprs.append(read(text))
    if not exprs:raise ToolError('INVALID_ARGUMENT','Supply equations.')
    if any(e.free_symbols-set(variables+params) for e in exprs):raise ToolError('INVALID_ARGUMENT','Declare every variable and parameter.')
    info=dict(declared='real',conditions=list(dict.fromkeys(str(c) for c in constraints)),exclusions=[],analysisComplete=complete_domain)
    result=dict(representation='exact',domain=info,variables=names,parameters=parameters,inputExpressions=inputs,completeness='unknown')
    checks=[]
    def inspect(values):
        assignment=dict(zip(variables,values));conditions=[sp.simplify(c.subs(assignment)) for c in constraints]
        residuals=[sp.simplify(e.subs(assignment)) for e in exprs]
        if any(c is sp.S.false for c in conditions) or any(r.is_zero is False for r in residuals):return 'rejected'
        return 'verified' if all(c is sp.S.true for c in conditions) and all(r==0 for r in residuals) else 'conditional'
    if op=='single':
        if len(exprs)!=1 or len(variables)!=1 or params:raise ToolError('INVALID_ARGUMENT','single requires one equation, one variable and no parameters.')
        x=variables[0];solution=sp.solveset(exprs[0],x,domain=sp.S.Reals)
        solution=filter_solutions(solution,constraints,x,'real')
        result.update(kind='solution_set',**packed(solution),solutionKind='empty' if solution is sp.S.EmptySet else 'conditional' if solution.has(sp.ConditionSet) else 'finite' if isinstance(solution,sp.FiniteSet) else 'set',
                      solverReportedCompleteness='unknown' if solution.has(sp.ConditionSet) else 'complete')
        if isinstance(solution,sp.FiniteSet):
            candidates=[dict(value=packed(v),verification=inspect([v])) for v in solution]
            result['candidates']=candidates
            accepted=[v for v in solution if inspect([v])=='verified']
            pending=[v for v in solution if inspect([v])=='conditional']
            result['rejectedCandidates']=[packed(v) for v in solution if inspect([v])=='rejected']
            filtered=sp.FiniteSet(*accepted)
            if pending:filtered=sp.Union(filtered,sp.ConditionSet(x,sp.And(sp.Eq(exprs[0],0,evaluate=False),*constraints),sp.FiniteSet(*pending)))
            result.update(**packed(filtered),solutionKind='conditional' if pending else 'finite' if accepted else 'empty')
            for entry in candidates:
                checks.append(dict(name='Original equation and domain substitution',status='passed' if entry['verification']=='verified' else 'unknown',passed=entry['verification']=='verified',evidence='symbolic_consistency'))
        if solution.has(sp.ConditionSet):result['state']='unresolved'
    elif op=='linear_system':
        try:A,b=sp.linear_eq_to_matrix(exprs,variables)
        except NonlinearError:raise ToolError('INVALID_ARGUMENT','The system must be linear in the declared variables.')
        if params:
            if len(params)!=1 or max(A.shape)>3:raise ToolError('RESOURCE_LIMIT','Parameter systems support one real parameter and at most 3 rows/variables.')
            parameter=params[0];critical=set();denominators=[];aug=A.row_join(b)
            for entry in aug:
                numerator,denominator=sp.cancel(entry).as_numer_denom()
                if denominator!=1:denominators.append(denominator)
                for part in (numerator,denominator):
                    try:p=sp.Poly(part,parameter,domain='QQ')
                    except sp.PolynomialError:raise ToolError('UNSUPPORTED','Parameter coefficients must be rational functions over QQ.')
                    if p.degree()>8:raise ToolError('RESOURCE_LIMIT','Parameter polynomial degree exceeds 8.')
            # Rank can change only when an augmented-matrix minor vanishes.
            for size in range(1,min(aug.shape)+1):
                for rows in itertools.combinations(range(aug.rows),size):
                    for cols in itertools.combinations(range(aug.cols),size):
                        num,den=sp.cancel(aug.extract(rows,cols).det()).as_numer_denom()
                        for term in (num,den):
                            p=sp.Poly(term,parameter,domain='QQ')
                            if p.degree()>8:raise ToolError('RESOURCE_LIMIT','Parameter minor degree exceeds 8.')
                            if not p.is_zero and p.degree()>0:critical.update(p.real_roots())
            if len(critical)>24:raise ToolError('RESOURCE_LIMIT','Too many exceptional parameter values.')
            def branch(matrix,rhs,condition,substitution=None):
                solution=sp.linsolve((matrix,rhs),variables)
                values=[] if solution is sp.S.EmptySet else list(next(iter(solution)))
                entry=dict(condition=condition,solutionKind='empty' if solution is sp.S.EmptySet else 'parametric' if any(v.free_symbols & set(variables) for v in values) else 'unique',
                           solution=[packed(v) for v in values])
                if values:
                    residual=matrix*sp.Matrix(values)-rhs
                    entry['verified']=all(sp.simplify(v)==0 for v in residual)
                    if not entry['verified']:raise ToolError('VERIFICATION_FAILED','Linear-system substitution failed.')
                return entry
            branches=[branch(A,b,' and '.join(str(sp.Ne(parameter,v,evaluate=False)) for v in sorted(critical,key=sp.default_sort_key)) or 'True')]
            for point in sorted(critical,key=sp.default_sort_key):
                if any(sp.simplify(d.subs(parameter,point))==0 for d in denominators):
                    branches.append(dict(condition=str(sp.Eq(parameter,point,evaluate=False)),solutionKind='undefined'));continue
                branches.append(branch(A.subs(parameter,point),b.subs(parameter,point),str(sp.Eq(parameter,point,evaluate=False))))
            result.update(kind='parameter_system',branches=branches,completeness='complete' if not constraints else 'unknown')
            result['warnings']=['Branches are additionally subject to the retained original-domain conditions.'] if constraints else []
        else:
            solution=sp.linsolve((A,b),variables)
            values=[] if solution is sp.S.EmptySet else list(next(iter(solution)))
            result.update(kind='linear_system',solutionKind='empty' if solution is sp.S.EmptySet else 'parametric' if any(v.free_symbols for v in values) else 'unique',solution=[packed(v) for v in values],completeness='complete' if not constraints else 'unknown')
            if values:
                status=inspect(values);result['conditions']=[str(sp.simplify(c.subs(dict(zip(variables,values))))) for c in constraints]
                if status=='rejected':result.update(solutionKind='empty',solution=[])
                else:checks.append(dict(name='Exact linear-system substitution',status='passed' if status=='verified' else 'unknown',passed=status=='verified',evidence='exact_algebra'))
    elif op=='polynomial_system':
        if params or len(variables)>3:raise ToolError('UNSUPPORTED','Polynomial systems support at most three variables and no parameters.')
        polynomials=[]
        for expr in exprs:
            if sp.count_ops(expr)>80 or any(p.exp.is_Integer and abs(p.exp)>4 for p in expr.atoms(sp.Pow)):raise ToolError('RESOURCE_LIMIT','Polynomial-system budget exceeded.')
            p=sp.Poly(expr,*variables,domain='QQ')
            if p.total_degree()>4 or len(p.terms())>50:raise ToolError('RESOURCE_LIMIT','Polynomial-system degree/term budget exceeded.')
            polynomials.append(p.as_expr())
        basis=sp.groebner(polynomials,*variables)
        if list(basis)==[1]:result.update(solutionKind='empty',solutions=[],completeness='complete')
        elif not basis.is_zero_dimensional:result.update(state='unresolved',solutionKind='positive_dimensional',basis=[str(v) for v in basis])
        else:
            try:solutions=sp.solve_poly_system(polynomials,*variables,strict=True)
            except (NotImplementedError,sp.polys.polyerrors.UnsolvableFactorError):solutions=None
            if solutions is None:result.update(state='unresolved',solutionKind='unresolved',basis=[str(v) for v in basis])
            else:
                accepted=[];pending=[]
                for values in solutions:
                    if any(v.is_real is False for v in values):continue
                    status=inspect(values)
                    if status=='rejected':continue
                    (accepted if status=='verified' and all(v.is_real is True for v in values) else pending).append([packed(v) for v in values])
                    if status=='verified':checks.append(dict(name='Polynomial system original-equation substitution',status='passed',passed=True,evidence='exact_algebra'))
                result.update(solutionKind='finite' if accepted or pending else 'empty',solutions=accepted,candidates=pending,
                              completeness='complete' if not pending else 'unknown')
    else:raise ToolError('UNSUPPORTED','Unknown equation operation.')
    return value_result(result,verification=checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Original equation and domain checks; completeness is stated separately.',checks),assumptions=info['conditions'])
