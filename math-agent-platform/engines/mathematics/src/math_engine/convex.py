"""Finite-dimensional convex programs. No eval or generated executable expressions."""
import numpy as np
import cvxpy as cp
from .common import ToolError, value_result, checked, table_view
from .precision import PrecisionPolicy, check_status


def feasibility_checks(args, values, policy):
    """Check every original constraint separately, in original units."""
    x = np.asarray(values, dtype=float)
    checks = []
    for matrix, bounds, equality in [('inequalityMatrix','inequalityBounds',False),('equalityMatrix','equalityBounds',True)]:
        if matrix not in args: continue
        A, b = np.asarray(args[matrix]), np.asarray(args[bounds])
        delta = A @ x - b
        scales = np.abs(A) @ np.abs(x) + np.abs(b)
        for i, (d, scale) in enumerate(zip(delta, scales)):
            checks.append(policy.check(f'{matrix}[{i}]', abs(d) if equality else max(0., d), scale))
    for key in ('lower','upper'):
        if key not in args: continue
        b = np.asarray(args[key]); delta = b-x if key == 'lower' else x-b
        for i, (d, scale) in enumerate(zip(delta, np.abs(x)+np.abs(b))):
            checks.append(policy.check(f'{key}[{i}]', max(0., d), scale))
    for i, cone in enumerate(args.get('cones', [])):
        A,b,c = np.asarray(cone['matrix']),np.asarray(cone['offset']),np.asarray(cone['axis'])
        lhs, rhs = float(np.linalg.norm(A@x+b)), float(c@x+cone['bound'])
        scale = float(np.linalg.norm(np.abs(A)@np.abs(x)+np.abs(b)) + np.abs(c)@np.abs(x)+abs(cone['bound']))
        checks.append(policy.check(f'cones[{i}]',max(0.,lhs-rhs),scale))
    return checks


def optimize(args):
    op = args['operation']; policy = PrecisionPolicy.from_arguments(args, 1e-7); tol = policy.absoluteTolerance
    for key in ('quadratic', 'design', 'target'):
        owner = 'quadratic_program' if key == 'quadratic' else 'least_squares'
        if key in args and op != owner: raise ToolError('INVALID_ARGUMENT', key + ' is not used by this operation.')
    if op == 'second_order_cone' and not args.get('cones'):
        raise ToolError('INVALID_ARGUMENT', 'Supply at least one second-order cone.')
    def array(key, ndim, value=None):
        try: a = np.asarray(args[key] if value is None else value, dtype=float)
        except (ValueError, TypeError, KeyError): raise ToolError('INVALID_ARGUMENT', 'Invalid array: '+key)
        if a.ndim != ndim or not a.size or not np.isfinite(a).all(): raise ToolError('INVALID_ARGUMENT', 'Invalid finite array: '+key)
        return a
    if op == 'least_squares':
        design, target = array('design', 2), array('target', 1); n = design.shape[1]
        if len(target) != design.shape[0]: raise ToolError('INVALID_ARGUMENT', 'Least-squares dimensions do not match.')
    else: n = len(array('linear', 1))
    if not 1 <= n <= 100: raise ToolError('RESOURCE_LIMIT', 'Use at most 100 decision variables.')
    x = cp.Variable(n); q = array('linear', 1) if 'linear' in args else np.zeros(n)
    if q.shape != (n,): raise ToolError('INVALID_ARGUMENT', 'Linear objective dimension does not match.')
    objective = q @ x; min_eigenvalue = None
    if op == 'quadratic_program':
        P = array('quadratic', 2)
        if P.shape != (n, n) or not np.allclose(P, P.T, atol=1e-12, rtol=0):
            raise ToolError('NON_CONVEX', 'Quadratic matrix must be symmetric.')
        min_eigenvalue = float(np.linalg.eigvalsh(P).min())
        psd_uncertainty = np.finfo(float).eps * n * max(1.,float(np.linalg.norm(P,2))) * 10
        if -psd_uncertainty <= min_eigenvalue < 0:
            raise ToolError('PSD_UNCERTAIN', 'PSD is numerically uncertain; the original matrix has not been modified.')
        if min_eigenvalue < 0: raise ToolError('NON_CONVEX', 'Quadratic matrix is not positive semidefinite.')
        objective += 0.5 * cp.quad_form(x, P)
    elif op == 'least_squares': objective += cp.sum_squares(design @ x - target)
    constraints = []
    for matrix, bounds, equality in [('inequalityMatrix', 'inequalityBounds', False), ('equalityMatrix', 'equalityBounds', True)]:
        if matrix in args or bounds in args:
            A, b = array(matrix, 2), array(bounds, 1)
            if A.shape != (len(b), n): raise ToolError('INVALID_ARGUMENT', 'Constraint dimensions do not match.')
            constraints.append(A @ x == b if equality else A @ x <= b)
    for key in ('lower', 'upper'):
        if key in args:
            b = array(key, 1)
            if len(b) != n: raise ToolError('INVALID_ARGUMENT', 'Bound dimension does not match.')
            constraints.append(x >= b if key == 'lower' else x <= b)
    for cone in args.get('cones', []):
        A, b, c = array('matrix', 2, cone['matrix']), array('offset', 1, cone['offset']), array('axis', 1, cone['axis'])
        if A.shape != (len(b), n) or c.shape != (n,): raise ToolError('INVALID_ARGUMENT', 'Cone dimensions do not match.')
        constraints.append(cp.norm(A @ x + b, 2) <= c @ x + cone['bound'])
    problem = cp.Problem(cp.Minimize(objective), constraints)
    if not problem.is_dcp(): raise ToolError('DCP_UNRECOGNIZED', 'Convexity could not be confirmed by DCP rules.')
    try: problem.solve(solver='CLARABEL', tol_gap_abs=tol, tol_gap_rel=policy.relativeTolerance, tol_feas=tol, max_iter=policy.maxIterations)
    except cp.error.SolverError: raise ToolError('SOLVER_ERROR', 'Convex solver did not produce a reliable status.')
    status = problem.status; feasible = status in ('optimal', 'optimal_inaccurate') and x.value is not None
    values = x.value.tolist() if feasible else None
    if feasible and not np.isfinite(x.value).all(): raise ToolError('SOLVER_ERROR', 'Solver returned non-finite primal values.')
    checks = feasibility_checks(args, values, policy) if feasible else []
    residual = max((c['observed'] for c in checks if c['observed'] is not None), default=0.0) if feasible else None
    verification_status = check_status(checks)
    normalized_status = {'user_limit':'iteration_limit'}.get(status, status)
    if feasible and verification_status in ('failed', 'unknown'): normalized_status = 'optimal_inaccurate'
    notes = ['Numerical solver output; not an exact proof or independently verified optimality certificate.']
    if status.endswith('inaccurate'): notes.append('Solver reports reduced accuracy.')
    if verification_status in ('failed', 'unknown'): notes.append('Original-model feasibility did not pass the requested per-constraint tolerance.')
    result = {'status': status, 'normalizedStatus': normalized_status, 'state': 'computed' if feasible and normalized_status == 'optimal' and verification_status not in ('failed','unknown') else 'partial' if feasible else 'unresolved',
              'objective': float(problem.value) if feasible and np.isfinite(problem.value) else None,
              'values': values, 'duals': [np.asarray(c.dual_value).tolist() if c.dual_value is not None else None for c in constraints],
              'maxConstraintViolation': residual}
    views = [table_view(['Variable', 'Value'], [[f'x[{i}]', v] for i, v in enumerate(values)], 'Optimization solution')] if values else []
    return value_result(result, views, {'solver': 'CLARABEL', 'dcp': True, 'tolerance': tol, 'minimumEigenvalue': min_eigenvalue,
                        'precision': policy.diagnostics(), 'rawSolverStatus':status,
                        'optimality':{'status':'not_checked','reason':'Independent KKT and certificate validation is not available.'},
                        'certificate':{'status':'not_checked','reason':'Solver status is not an independently verified certificate.'},
                        'iterations': problem.solver_stats.num_iters}, checked(verification_status,
                        'Original-model primal feasibility only. Optimality, infeasibility and unboundedness are solver-reported.',checks), notes=notes)
