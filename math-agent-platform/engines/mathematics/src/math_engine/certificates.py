"""Seek LP witnesses numerically, accept them only after rational verification."""
from fractions import Fraction
import numpy as np
import cvxpy as cp


def lp_certificate(args,status,policy):
    n=len(args['linear']);A=list(args.get('inequalityMatrix',[]));b=list(args.get('inequalityBounds',[]))
    E=list(args.get('equalityMatrix',[]));d=list(args.get('equalityBounds',[]))
    for key,sign in [('lower',-1),('upper',1)]:
        for i,value in enumerate(args.get(key,[])):
            row=[0]*n;row[i]=sign;A.append(row);b.append(sign*value)
    rational=lambda value:Fraction(str(value))
    rationalize=lambda values:[Fraction(float(v)).limit_denominator(1000000) for v in np.asarray(values).reshape(-1)]
    dot=lambda row,values:sum((rational(a)*v for a,v in zip(row,values)),Fraction(0))
    try:
        constraints=[]
        if status=='infeasible':
            y=cp.Variable(len(A),nonneg=True) if A else None;z=cp.Variable(len(E)) if E else None
            if y is None and z is None:return dict(status='unavailable',reason='No constraints to certify infeasibility.')
            balance=(np.asarray(A).T@y if A else np.zeros(n))+(np.asarray(E).T@z if E else np.zeros(n))
            rhs=(np.asarray(b)@y if A else 0)+(np.asarray(d)@z if E else 0)
            constraints=[balance==0,rhs==-1]
        elif status=='unbounded':
            point=cp.Variable(n);direction=cp.Variable(n);constraints=[np.asarray(args['linear'])@direction==-1]
            if A:constraints.extend([np.asarray(A)@point<=b,np.asarray(A)@direction<=0])
            if E:constraints.extend([np.asarray(E)@point==d,np.asarray(E)@direction==0])
        else:return dict(status='not_checked',reason='Exact witnesses are sought only for definite LP infeasible/unbounded statuses.')
        auxiliary=cp.Problem(cp.Minimize(0),constraints)
        auxiliary.solve(solver='CLARABEL',max_iter=min(policy.maxIterations,100),tol_feas=policy.absoluteTolerance,tol_gap_abs=policy.absoluteTolerance,tol_gap_rel=policy.relativeTolerance)
        if auxiliary.status not in ('optimal','optimal_inaccurate'):return dict(status='unavailable',reason='Witness search did not converge.')
        if status=='infeasible':
            yy=rationalize(y.value) if A else [];zz=rationalize(z.value) if E else []
            balance=[sum((rational(A[i][j])*yy[i] for i in range(len(A))),Fraction(0))+sum((rational(E[i][j])*zz[i] for i in range(len(E))),Fraction(0)) for j in range(n)]
            rhs=dot(b,yy)+dot(d,zz)
            verified=all(v>=0 for v in yy) and all(v==0 for v in balance) and rhs<0
            witness=dict(kind='farkas',inequalityMultipliers=[str(v) for v in yy],equalityMultipliers=[str(v) for v in zz],rhs=str(rhs))
        else:
            xx,rr=rationalize(point.value),rationalize(direction.value)
            verified=all(dot(row,xx)<=rational(bound) for row,bound in zip(A,b)) and all(dot(row,xx)==rational(bound) for row,bound in zip(E,d)) and all(dot(row,rr)<=0 for row in A) and all(dot(row,rr)==0 for row in E) and dot(args['linear'],rr)<0
            witness=dict(kind='unbounded_ray',feasiblePoint=[str(v) for v in xx],direction=[str(v) for v in rr])
        return dict(status='verified' if verified else 'unavailable',witness=witness if verified else None,
                    method='Exact Fraction identities and inequalities after bounded-denominator rational reconstruction.',
                    scope='Received decimal LP coefficients; inequality order: supplied inequalities, lower bounds, upper bounds.',
                    reason=None if verified else 'Numerical witness could not be reconstructed into an exact certificate.')
    except (cp.error.SolverError,ValueError,TypeError,OverflowError,ZeroDivisionError):
        return dict(status='unavailable',reason='Auxiliary witness search or rational reconstruction failed; original solver status is unchanged.')
