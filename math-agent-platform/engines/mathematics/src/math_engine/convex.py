"""Finite-dimensional convex programs. No eval or generated executable expressions."""
import numpy as np
import cvxpy as cp
from .common import ToolError, value_result, checked, table_view


def optimize(args):
    op = args['operation']; tol = args.get('tolerance', 1e-7)
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
    if not problem.is_dcp(): raise ToolError('NON_CONVEX', 'Problem does not satisfy disciplined convex programming rules.')
    try: problem.solve(solver='CLARABEL', tol_gap_abs=tol, tol_gap_rel=tol, tol_feas=tol, max_iter=200)
    except cp.error.SolverError: raise ToolError('SOLVER_ERROR', 'Convex solver did not produce a reliable status.')
    status = problem.status; feasible = status in ('optimal', 'optimal_inaccurate') and x.value is not None
    residual = max((float(np.max(np.abs(c.violation()))) for c in constraints), default=0.0) if feasible else None
    values = x.value.tolist() if feasible else None
    if feasible and not np.isfinite(x.value).all(): raise ToolError('SOLVER_ERROR', 'Solver returned non-finite primal values.')
    notes = ['Numerical solver output; not an exact proof or independently verified optimality certificate.']
    if status.endswith('inaccurate'): notes.append('Solver reports reduced accuracy.')
    if residual is not None and residual > tol * 10: notes.append('Primal feasibility residual exceeds the requested tolerance.')
    result = {'status': status, 'objective': float(problem.value) if feasible and np.isfinite(problem.value) else None,
              'values': values, 'duals': [np.asarray(c.dual_value).tolist() if c.dual_value is not None else None for c in constraints],
              'maxConstraintViolation': residual}
    views = [table_view(['Variable', 'Value'], [[f'x[{i}]', v] for i, v in enumerate(values)], 'Optimization solution')] if values else []
    return value_result(result, views, {'solver': 'CLARABEL', 'dcp': True, 'tolerance': tol, 'minimumEigenvalue': min_eigenvalue,
                        'iterations': problem.solver_stats.num_iters}, checked('numerically_checked' if feasible else 'not_checked',
                        'DCP accepted; primal feasibility checked numerically. Optimality is reported by the solver.'), notes=notes)
