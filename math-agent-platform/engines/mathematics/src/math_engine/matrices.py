"""Exact and numerical linear algebra with reconstruction checks."""
import warnings
import sympy as sp
import numpy as np
from .ir import parse,lower,encode
from .domains import analyze
from .common import ToolError,value_result,checked
from .precision import PrecisionPolicy,check_status


def matrices(args):
    op=args['operation'];mode=args.get('mode','numeric' if op in ('qr','svd','least_squares','sparse_solve') else 'exact')
    checks=[];info=dict(declared='real',conditions=[],exclusions=[],analysisComplete=True)
    if mode=='exact':
        if op not in ('determinant','rank','inverse','nullspace','solve','quadratic_form'):raise ToolError('UNSUPPORTED','Operation requires numeric mode.')
        def scalar(v):
            if isinstance(v,bool) or not isinstance(v,(str,int)):raise ToolError('INVALID_ARGUMENT','Exact matrix entries must be strings or integers, never JSON floats.')
            tree=parse(str(v));conditions,domain=analyze(tree);value=lower(tree)
            if not isinstance(value,sp.Expr) or value.free_symbols or value.is_real is not True or value.is_algebraic is not True:raise ToolError('UNSUPPORTED','Exact matrices require real algebraic constants; use equation_math for parameters.')
            info['conditions'].extend(domain['conditions']);info['analysisComplete'] &= domain['analysisComplete']
            return sp.simplify(value)
        rows=args.get('matrix')
        if not rows or not rows[0] or any(len(r)!=len(rows[0]) for r in rows) or max(len(rows),len(rows[0]))>12:raise ToolError('INVALID_ARGUMENT','Exact matrix must be rectangular and at most 12 by 12.')
        A=sp.Matrix([[scalar(v) for v in row] for row in rows]);result=dict(representation='exact',domain=info,shape=list(A.shape))
        def check(name,value):
            passed=all(sp.simplify(v)==0 for v in value) if isinstance(value,sp.MatrixBase) else bool(value)
            checks.append(dict(name=name,passed=passed,status='passed' if passed else 'failed',evidence='exact_algebra'))
        if op in ('determinant','inverse','quadratic_form') and A.rows!=A.cols:raise ToolError('INVALID_ARGUMENT','A square matrix is required.')
        if op=='determinant':result.update(ir=encode(A.det()),value=str(A.det()))
        elif op=='rank':result.update(rank=A.rank(),nullity=A.cols-A.rank())
        elif op=='inverse':
            if A.det()==0:raise ToolError('SINGULAR_MATRIX','Matrix has no inverse.')
            inverse=A.inv();result['ir']=encode(inverse);check('A inverse equals identity',A*inverse-sp.eye(A.rows))
        elif op=='nullspace':
            vectors=A.nullspace();result.update(basis=[encode(v) for v in vectors],dimension=len(vectors))
            for v in vectors:check('Nullspace vector',A*v)
            check('Rank-nullity',A.rank()+len(vectors)==A.cols)
        elif op=='solve':
            b=sp.Matrix([scalar(v) for v in args.get('vector',[])])
            if b.shape!=(A.rows,1):raise ToolError('INVALID_ARGUMENT','Right-hand side length must match rows.')
            solution=sp.linsolve((A,b))
            if solution is sp.S.EmptySet:result.update(solutionKind='empty',completeness='complete')
            else:
                values=sp.Matrix(next(iter(solution)));free=sorted(values.free_symbols,key=str)
                result.update(solutionKind='parametric' if free else 'unique',ir=encode(values),parameters=[str(v) for v in free],completeness='complete')
                check('Exact matrix solution',A*values-b)
        else:
            if A!=A.T:raise ToolError('INVALID_ARGUMENT','Quadratic-form matrix must be symmetric.')
            eigen=A.eigenvals();positive=negative=zero=0
            for v,m in eigen.items():
                if v.is_positive:positive+=m
                elif v.is_negative:negative+=m
                elif v.is_zero:zero+=m
                else:raise ToolError('UNSUPPORTED','Could not determine exact eigenvalue signs.')
            result.update(inertia=dict(positive=positive,negative=negative,zero=zero),classification='positive_definite' if positive==A.rows else 'negative_definite' if negative==A.rows else 'indefinite' if positive and negative else 'positive_semidefinite' if positive else 'negative_semidefinite' if negative else 'zero')
            check('Inertia dimension',positive+negative+zero==A.rows)
        if any(not c['passed'] for c in checks):raise ToolError('VERIFICATION_FAILED','Exact matrix identity failed.')
        return value_result(result,verification=checked('passed' if checks else 'not_checked','Exact matrix identities using SymPy.',checks))
    from scipy import linalg,sparse
    from scipy.sparse import linalg as splinalg
    policy=PrecisionPolicy.from_arguments(args);diagnostics={'precision':policy.diagnostics()};notes=[]
    if op=='sparse_solve':
        data=args.get('sparse')
        if not data:raise ToolError('INVALID_ARGUMENT','Supply a sparse COO matrix.')
        shape=data['shape'];rows=data['rows'];cols=data['columns'];values=data['values']
        if len(rows)!=len(cols) or len(rows)!=len(values) or shape[0]!=shape[1] or any(r>=shape[0] for r in rows) or any(c>=shape[1] for c in cols):raise ToolError('INVALID_ARGUMENT','Invalid sparse dimensions or indices.')
        A=sparse.coo_matrix((values,(rows,cols)),shape=tuple(shape)).tocsr();b=np.asarray(args.get('vector'),dtype=float)
        if b.shape!=(shape[0],) or not np.isfinite(b).all():raise ToolError('INVALID_ARGUMENT','Invalid sparse right-hand side.')
        iterations=[0]
        def count(_):iterations[0]+=1
        x,status=splinalg.gmres(A,b,atol=policy.absoluteTolerance,rtol=policy.relativeTolerance,maxiter=policy.maxIterations,callback=count,callback_type='legacy')
        residual=float(np.linalg.norm(A@x-b));scale=float(splinalg.norm(A)*np.linalg.norm(x)+np.linalg.norm(b))
        checks=[policy.check('Sparse linear residual',residual,scale)]
        result=dict(values=x.tolist(),representation='approximate',state='computed' if status==0 and checks[0]['passed'] else 'partial')
        diagnostics.update(method='gmres',iterations=iterations[0],solverInfo=int(status),conditionNumber=None,conditionReason='Sparse condition estimation not performed; matrix never densified.',residual=residual,nonzeros=A.nnz)
        return value_result(result,diagnostics=diagnostics,verification=checked(check_status(checks),'Numerical residual only.',checks))
    A=np.asarray(args.get('matrix'),dtype=float)
    if A.ndim!=2 or not A.size or max(A.shape)>100 or not np.isfinite(A).all():raise ToolError('INVALID_ARGUMENT','Supply a finite matrix of at most 100 by 100.')
    condition=float(np.linalg.cond(A));diagnostics.update(conditionNumber=condition if np.isfinite(condition) else None,conditionInfinite=bool(np.isinf(condition)))
    if condition>1e10:notes.append('Ill-conditioned matrix; small residual does not establish small forward error.')
    result=dict(representation='approximate',shape=list(A.shape))
    if op=='qr':
        Q,R=linalg.qr(A,mode='economic');result.update(Q=Q.tolist(),R=R.tolist())
        checks=[policy.check('QR reconstruction',float(np.linalg.norm(Q@R-A)),np.linalg.norm(A)),policy.check('Q orthogonality',float(np.linalg.norm(Q.T@Q-np.eye(Q.shape[1]))),1)]
    elif op=='svd':
        U,s,Vh=linalg.svd(A,full_matrices=False);result.update(U=U.tolist(),singularValues=s.tolist(),Vh=Vh.tolist())
        checks=[policy.check('SVD reconstruction',float(np.linalg.norm((U*s)@Vh-A)),np.linalg.norm(A)),policy.check('U orthogonality',float(np.linalg.norm(U.T@U-np.eye(len(s)))),1),policy.check('V orthogonality',float(np.linalg.norm(Vh@Vh.T-np.eye(len(s)))),1)]
    elif op in ('least_squares','solve'):
        b=np.asarray(args.get('vector'),dtype=float)
        if b.shape!=(A.shape[0],) or not np.isfinite(b).all():raise ToolError('INVALID_ARGUMENT','Vector must match matrix rows.')
        if op=='solve' and A.shape[0]!=A.shape[1]:raise ToolError('INVALID_ARGUMENT','solve requires a square matrix; use least_squares otherwise.')
        x,residuals,rank,s=linalg.lstsq(A,b,cond=args.get('rankTolerance'));residual=A@x-b
        result.update(values=x.tolist(),rank=int(rank),singularValues=s.tolist(),residualNorm=float(np.linalg.norm(residual)))
        diagnostics['rankTolerance']=args.get('rankTolerance');diagnostics['rankThresholdPolicy']='SciPy default when null'
        if op=='solve':checks=[policy.check('Linear residual',float(np.linalg.norm(residual)),np.linalg.norm(A)*np.linalg.norm(x)+np.linalg.norm(b))]
        else:checks=[policy.check('Least-squares stationarity',float(np.linalg.norm(A.T@residual)),np.linalg.norm(A)*(np.linalg.norm(A)*np.linalg.norm(x)+np.linalg.norm(b)))]
    else:raise ToolError('UNSUPPORTED','Numeric mode supports QR, SVD, least_squares, solve and sparse_solve.')
    return value_result(result,diagnostics=diagnostics,verification=checked(check_status(checks),'Floating-point reconstruction and residual checks; no strict forward error bound.',checks),notes=notes)
