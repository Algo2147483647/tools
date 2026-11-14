"""Whitelisted named convex models; original objective and constraints are retained."""
import numpy as np
import cvxpy as cp
from .common import ToolError,value_result,table_view,checked
from .precision import PrecisionPolicy,check_status


def optimality_checks(problem,variables,policy):
    """Numerical KKT checks where CVXPY supplies gradients; unavailable is explicit."""
    checks=[];unavailable=[]
    if any(c.dual_value is None for c in problem.constraints):return [],['Solver did not return every dual value.']
    if any(atom.__name__ in ('abs','max','maximum','norm1','norm_inf') for atom in problem.atoms()):
        return [],['Nonsmooth model: a selected gradient is not an independently recovered KKT subgradient.']
    try:
        objective=problem.objective.expr
        sign=1 if isinstance(problem.objective,cp.Minimize) else -1
        for variable in variables:
            def derivative(expr):
                gradients=expr.grad
                if variable not in gradients:return np.zeros((variable.size,expr.size))
                gradient=gradients[variable]
                if gradient is None:raise ValueError('Gradient unavailable or nondifferentiable at solution.')
                return gradient.toarray() if hasattr(gradient,'toarray') else np.asarray(gradient)
            stationarity=sign*derivative(objective).reshape(variable.size);scale=float(np.linalg.norm(stationarity))
            for constraint in problem.constraints:
                dual=np.asarray(constraint.dual_value).reshape(-1,order='F')
                term=derivative(constraint.expr)@dual;stationarity+=term;scale+=float(np.linalg.norm(term))
            checks.append(policy.check('KKT stationarity '+variable.name(),float(np.linalg.norm(stationarity)),scale))
        for i,c in enumerate(problem.constraints):
            if isinstance(c,cp.constraints.nonpos.Inequality):
                dual=np.asarray(c.dual_value);slack=np.asarray(c.expr.value)
                checks.append(policy.check(f'KKT dual feasibility {i}',float(np.max(np.maximum(-dual,0))),float(np.max(abs(dual)))))
                checks.append(policy.check(f'KKT complementarity {i}',float(np.max(abs(dual*slack))),float(np.max(abs(dual)))*max(1.,float(np.max(abs(slack))))))
    except (ValueError,TypeError,NotImplementedError) as exc:unavailable.append(str(exc))
    return checks,unavailable


def model(args):
    policy=PrecisionPolicy.from_arguments(args,1e-7);variables={};parameters={};bound_constraints=[];entries=0
    for declaration in args['variables']:
        name=declaration['name'];shape=tuple(declaration.get('shape',[]))
        if name in variables:raise ToolError('INVALID_ARGUMENT','Duplicate variable name.')
        entries+=int(np.prod(shape)) if shape else 1
        if entries>100:raise ToolError('RESOURCE_LIMIT','Model exceeds 100 scalar decision variables.')
        variable=cp.Variable(shape=shape,name=name);variables[name]=variable
        for key in ('lower','upper'):
            if key in declaration:
                value=np.asarray(declaration[key],dtype=float)
                if value.shape not in ((),shape) or not np.isfinite(value).all():raise ToolError('INVALID_ARGUMENT','Variable bound shape mismatch.')
                bound_constraints.append((name+'.'+key,variable>=value if key=='lower' else variable<=value,variable,cp.Constant(value)))
    for name,value in args.get('parameters',{}).items():
        data=np.asarray(value,dtype=float)
        if data.ndim>2 or data.size>10000 or not np.isfinite(data).all():raise ToolError('INVALID_ARGUMENT','Invalid finite model constant.')
        parameters[name]=data
    count=[0]
    def build(node,depth=0):
        count[0]+=1
        if depth>32 or count[0]>512:raise ToolError('RESOURCE_LIMIT','Model expression budget exceeded.')
        if not isinstance(node,dict) or 'kind' not in node:raise ToolError('INVALID_ARGUMENT','Model nodes require kind.')
        kind=node['kind']
        if kind in ('variable','parameter'):
            if set(node)!={'kind','name'}:raise ToolError('INVALID_ARGUMENT','Unexpected model-reference fields.')
            source=variables if kind=='variable' else parameters
            if node['name'] not in source:raise ToolError('INVALID_ARGUMENT','Unknown model reference: '+str(node['name']))
            return source[node['name']] if kind=='variable' else cp.Constant(source[node['name']])
        if kind=='constant':
            if set(node)!={'kind','value'}:raise ToolError('INVALID_ARGUMENT','Unexpected constant fields.')
            data=np.asarray(node['value'],dtype=float)
            if data.ndim>2 or data.size>10000 or not np.isfinite(data).all():raise ToolError('INVALID_ARGUMENT','Invalid model constant.')
            return cp.Constant(data)
        allowed={'kind','args'}|({'order'} if kind=='norm' else {'index'} if kind=='index' else set())
        if set(node)-allowed or not isinstance(node.get('args'),list):raise ToolError('INVALID_ARGUMENT','Invalid model-node fields.')
        children=[build(v,depth+1) for v in node['args']]
        if kind in ('add','subtract','multiply','matmul','quad_form'):
            if len(children)!=2:raise ToolError('INVALID_ARGUMENT','Binary model atom requires two operands.')
            a,b=children
            if kind in ('add','subtract','multiply') and a.shape!=b.shape and a.shape!=() and b.shape!=():raise ToolError('INVALID_ARGUMENT','Implicit non-scalar broadcasting is unsupported.')
            if kind=='add':return a+b
            if kind=='subtract':return a-b
            if kind=='multiply':
                if not (a.is_constant() or b.is_constant()):raise ToolError('DCP_UNRECOGNIZED','Multiplication requires at least one constant operand.')
                return cp.multiply(a,b)
            if kind=='matmul':
                if not (a.is_constant() or b.is_constant()):raise ToolError('DCP_UNRECOGNIZED','Matrix multiplication requires a constant operand.')
                return a@b
            if not b.is_constant() or b.shape!=(a.size,a.size):raise ToolError('INVALID_ARGUMENT','quad_form requires a constant square matrix.')
            matrix=np.asarray(b.value)
            if not np.array_equal(matrix,matrix.T):raise ToolError('INVALID_ARGUMENT','Quadratic matrix must be symmetric.')
            minimum=float(np.linalg.eigvalsh(matrix).min());uncertainty=np.finfo(float).eps*max(1.,float(np.linalg.norm(matrix,2)))*matrix.shape[0]*10
            if minimum<0:raise ToolError('PSD_UNCERTAIN' if minimum>=-uncertainty else 'NON_CONVEX','Quadratic PSD check failed; matrix was not modified.')
            return cp.quad_form(a,matrix)
        if len(children)!=1:raise ToolError('INVALID_ARGUMENT','Unary model atom requires one operand.')
        a=children[0]
        if kind=='negate':return -a
        if kind=='sum':return cp.sum(a)
        if kind=='max':return cp.max(a)
        if kind=='abs':return cp.abs(a)
        if kind=='norm':
            order=node.get('order',2)
            if order not in (1,2,'inf'):raise ToolError('UNSUPPORTED','Supported norm orders are 1, 2 and inf.')
            if len(a.shape)>1:raise ToolError('UNSUPPORTED','Only vector norms are supported.')
            return cp.norm(a,np.inf if order=='inf' else order)
        if kind=='sum_squares':return cp.sum_squares(a)
        if kind=='index':
            index=node.get('index')
            if type(index) is not int or len(a.shape)!=1 or not 0<=index<a.shape[0]:raise ToolError('INVALID_ARGUMENT','Invalid vector index.')
            return a[index]
        raise ToolError('UNSUPPORTED','Unknown convex-model atom: '+str(kind))
    objective=build(args['objective']['expression'])
    if objective.shape!=():raise ToolError('INVALID_ARGUMENT','Objective must be scalar.')
    records=list(bound_constraints);ids={record[0] for record in records}
    for i,entry in enumerate(args.get('constraints',[])):
        name=entry.get('name',f'constraint_{i}')
        if name in ids:raise ToolError('INVALID_ARGUMENT','Constraint names must be unique.')
        ids.add(name);left,right=build(entry['left']),build(entry['right'])
        if left.shape!=right.shape and left.shape!=() and right.shape!=():raise ToolError('INVALID_ARGUMENT','Constraint shape mismatch.')
        relation=entry['relation'];constraint={'<=':lambda:left<=right,'>=':lambda:left>=right,'=':lambda:left==right}[relation]()
        records.append((name,constraint,left,right))
    problem=cp.Problem(cp.Minimize(objective) if args['objective'].get('sense','minimize')=='minimize' else cp.Maximize(objective),[r[1] for r in records])
    if not problem.is_dcp():raise ToolError('DCP_UNRECOGNIZED','Model is not recognized by the supported DCP rules.')
    try:problem.solve(solver='CLARABEL',tol_gap_abs=policy.absoluteTolerance,tol_gap_rel=policy.relativeTolerance,tol_feas=policy.absoluteTolerance,max_iter=policy.maxIterations)
    except cp.error.SolverError:raise ToolError('SOLVER_ERROR','Convex-model solver failed.')
    status=problem.status;available=status in ('optimal','optimal_inaccurate') and all(v.value is not None for v in variables.values());checks=[];kkt=[];missing=[]
    values={name:np.asarray(v.value).tolist() for name,v in variables.items()} if available else None
    if available:
        if any(not np.isfinite(v.value).all() for v in variables.values()):raise ToolError('SOLVER_ERROR','Non-finite decision values.')
        for name,constraint,left,right in records:
            violation=np.asarray(constraint.violation());scale=np.abs(left.value)+np.abs(right.value)
            for i,(observed,s) in enumerate(zip(violation.reshape(-1),np.broadcast_to(scale,violation.shape).reshape(-1))):checks.append(policy.check(f'{name}[{i}]',float(observed),float(s)))
        kkt,missing=optimality_checks(problem,list(variables.values()),policy)
    normalized='iteration_limit' if status=='user_limit' else status
    if available and check_status(checks+kkt) in ('failed','unknown'):normalized='optimal_inaccurate'
    result=dict(status=status,normalizedStatus=normalized,state='computed' if normalized=='optimal' else 'partial' if available else 'unresolved',values=values,
                objective=float(objective.value) if available and np.isfinite(objective.value) else None,representation='approximate',
                duals={name:None if c.dual_value is None else np.asarray(c.dual_value).tolist() for name,c,_,_ in records})
    diagnostics=dict(solver='CLARABEL',dcp=True,precision=policy.diagnostics(),iterations=problem.solver_stats.num_iters,
                     originalModel=dict(variables=[dict(name=n,shape=list(v.shape)) for n,v in variables.items()],constraints=[r[0] for r in records]),
                     canonicalization='CVXPY DCP reductions; auxiliary solver variables are not exposed as user variables.',
                     optimality=dict(status=check_status(kkt),unavailable=missing),certificate=dict(status='not_checked',reason='No independently verified infeasibility/unboundedness certificate was supplied.'))
    views=[table_view(['Variable','Value'],[[n,str(v)] for n,v in values.items()],'Named optimization solution')] if values is not None else []
    return value_result(result,views,diagnostics,checked(check_status(checks+kkt),'Original-model primal feasibility and available numerical KKT checks; not a formal certificate.',checks+kkt),
                        notes=['Original objective includes all constant terms. Nonsmooth or unavailable gradients can leave KKT checks incomplete.'])
