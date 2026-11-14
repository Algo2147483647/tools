import copy
import unittest
from unittest.mock import patch
import numpy as np
import cvxpy as cp
from math_engine import execute
from math_engine.protocol import validate, RESPONSE_SCHEMA
from math_engine.common import ToolError
from math_engine.precision import PrecisionPolicy
from math_engine.convex import feasibility_checks


class M0Tests(unittest.TestCase):
    def call(self, tool, version=2, **args):
        reply = execute(dict(schemaVersion=version, tool=tool, arguments=args))
        validate(reply, RESPONSE_SCHEMA)
        self.assertEqual(reply['schemaVersion'], version)
        return reply

    def value(self, tool, **args):
        reply = self.call(tool, **args)
        self.assertTrue(reply['ok'], reply)
        return reply['value']

    def test_version_compatibility(self):
        old = self.call('exact_math', version=1, expression='1/3')['value']
        new = self.value('exact_math', expression='1/3')
        self.assertNotIn('representation', old['result'])
        self.assertEqual(new['result']['candidate'], old['result']['candidate'])
        self.assertEqual(new['result']['representation'], 'exact')
        self.assertEqual(new['verification']['evidence'], ['exact_arithmetic'])

    def test_v2_schema_rejects_invalid_semantics(self):
        reply = self.call('exact_math', expression='1')
        for field, bad in [('representation','proven'),('state','solved'),('completeness','yes')]:
            invalid = copy.deepcopy(reply); invalid['value']['result'][field] = bad
            with self.assertRaises(ToolError): validate(invalid, RESPONSE_SCHEMA)
        del reply['value']['verification']['evidence']
        with self.assertRaises(ToolError): validate(reply, RESPONSE_SCHEMA)

    def test_exact_endpoints(self):
        for bounds, expected in [(['0','1/3'],'1/3'),(['0','0.10000000000000000001'],'10000000000000000001/100000000000000000000'),
                                 (['9007199254740992','9007199254740993'],'1'),(['0','pi'],'pi'),([0,1],'1')]:
            v=self.value('symbolic_math',operation='integrate',expression='1',interval=bounds)
            self.assertEqual(v['result']['expression'], expected)
            self.assertEqual(v['result']['representation'], 'exact')

    def test_bad_endpoints(self):
        for bounds in [['x','2'],['0','sqrt(-1)'],['1','0'],['0','1/0'],[True,2],['0','__import__(1)']]:
            self.assertFalse(self.call('symbolic_math',operation='integrate',expression='1',interval=bounds)['ok'])

    def test_finite_roots_not_independently_complete(self):
        v=self.value('symbolic_math',operation='solve',expression='x^2=1')
        self.assertEqual(v['result']['completeness'],'unknown')
        self.assertEqual(v['result']['solverReportedCompleteness'],'complete')
        self.assertTrue(v['result']['domain']['analysisComplete'])

    def test_precision_rejections(self):
        base=dict(operation='integrate',expression='x',interval=[0,1])
        for precision in [dict(mode='certified'),dict(mode='high_precision'),dict(certificationRequired=True),dict(workingDigits=30,maxDigits=30)]:
            r=self.call('numeric_math',**base,precision=precision)
            self.assertEqual(r['error']['code'],'UNSUPPORTED_PRECISION')
        for precision in [dict(absoluteTolerance=-1),dict(relativeTolerance=0),dict(maxIterations=0),dict(workingDigits=15,maxDigits=10),dict(unrecognized=True)]:
            self.assertFalse(self.call('numeric_math',**base,precision=precision)['ok'])
        self.assertFalse(self.call('numeric_math',**base,tolerance=1e-7,precision={})['ok'])

    def test_error_estimate_is_not_bound(self):
        v=self.value('numeric_math',operation='integrate',expression='x^2',interval=[0,1],precision={'absoluteTolerance':1e-10,'relativeTolerance':1e-8})
        self.assertEqual(v['diagnostics']['errorBoundKind'],'estimated')
        self.assertFalse(v['diagnostics']['precision']['certified'])
        self.assertIsNone(v['diagnostics']['precision']['achievedDigits'])
        self.assertEqual(v['verification']['evidence'],['estimated_error'])

    def test_linear_backward_error_and_failed_check(self):
        v=self.value('numeric_math',operation='linear_solve',matrix=[[2,0],[0,4]],vector=[6,8])
        self.assertEqual(v['diagnostics']['normalizedBackwardError'],0)
        with patch('scipy.linalg.solve',return_value=np.array([0.,0.])):
            v=self.value('numeric_math',operation='linear_solve',matrix=[[2,0],[0,4]],vector=[6,8])
        self.assertEqual(v['verification']['status'],'failed')

    def test_iteration_limit_and_root_completeness(self):
        r=self.call('numeric_math',operation='root',expression='cos(x)-x',interval=[0,1],precision={'maxIterations':1})
        self.assertEqual(r['error']['code'],'NOT_CONVERGED')
        v=self.value('numeric_math',operation='root',expression='x-1',interval=[0,2])
        self.assertEqual(v['result']['completeness'],'unknown')
        self.assertIsNone(v['diagnostics']['positionErrorBound'])

    def test_residuals_are_per_constraint(self):
        policy=PrecisionPolicy(absoluteTolerance=1e-8,relativeTolerance=1e-8)
        checks=feasibility_checks(dict(equalityMatrix=[[1e12],[1]],equalityBounds=[1e12,0]),[1],policy)
        self.assertTrue(checks[0]['passed']); self.assertFalse(checks[1]['passed'])
        cone=dict(matrix=[[1]],offset=[0],axis=[0],bound=-1)
        self.assertFalse(feasibility_checks({'cones':[cone]},[0],policy)[0]['passed'])

    def test_convex_downgrade(self):
        def fake_solve(problem, **kwargs):
            problem.variables()[0].value=np.array([0.])
            problem._status='optimal'; problem._value=0.
            from types import SimpleNamespace
            problem._solver_stats=SimpleNamespace(num_iters=1)
        with patch.object(cp.Problem,'solve',fake_solve):
            v=self.value('convex_optimize',operation='linear_program',linear=[1],lower=[2])
        self.assertEqual(v['result']['status'],'optimal')
        self.assertEqual(v['result']['normalizedStatus'],'optimal_inaccurate')
        self.assertEqual(v['result']['state'],'partial')
        self.assertEqual(v['verification']['status'],'failed')
        self.assertEqual(v['result']['maxConstraintViolation'],2)

    def test_convex_statuses_and_failure(self):
        for args, status in [(dict(linear=[1],lower=[2],upper=[1]),'infeasible'),(dict(linear=[-1]),'unbounded')]:
            v=self.value('convex_optimize',operation='linear_program',**args)
            self.assertEqual(v['result']['normalizedStatus'],status)
            self.assertEqual(v['verification']['status'],'not_checked')
            self.assertIn(v['diagnostics']['certificate']['status'],('verified','unavailable'))
        with patch.object(cp.Problem,'solve',side_effect=cp.error.SolverError('failure')):
            r=self.call('convex_optimize',operation='linear_program',linear=[1])
        self.assertEqual(r['error']['code'],'SOLVER_ERROR')

    def test_inaccurate_and_iteration_statuses(self):
        from types import SimpleNamespace
        for status, expected in [('optimal_inaccurate','optimal_inaccurate'),('user_limit','iteration_limit'),
                                 ('infeasible_inaccurate','infeasible_inaccurate'),('infeasible_or_unbounded','infeasible_or_unbounded')]:
            def fake(problem, **kwargs):
                problem._status=status; problem._value=0.
                problem._solver_stats=SimpleNamespace(num_iters=kwargs['max_iter'])
                if status == 'optimal_inaccurate': problem.variables()[0].value=np.array([0.])
            with patch.object(cp.Problem,'solve',fake):
                v=self.value('convex_optimize',operation='linear_program',linear=[1],lower=[0],precision={'maxIterations':7})
            self.assertEqual(v['result']['normalizedStatus'],expected)
            self.assertNotEqual(v['result']['state'],'computed')
            self.assertEqual(v['diagnostics']['iterations'],7)

    def test_api_v2_deadline_and_batch(self):
        from math_engine import solve, batch, execution_context
        replies=batch(tool='exact_math',arguments_list=[{'expression':'1'},{'expression':'1/0'}],schema_version=2)
        self.assertEqual([r['ok'] for r in replies],[True,False])
        for reply in replies: validate(reply,RESPONSE_SCHEMA)
        with execution_context(deadline=0):
            reply=solve(tool='exact_math',arguments={'expression':'1'},schema_version=2)
        self.assertEqual(reply['schemaVersion'],2)
        self.assertEqual(reply['error']['code'],'TIMED_OUT')

    def test_psd_uncertainty_does_not_modify_matrix(self):
        r=self.call('convex_optimize',operation='quadratic_program',linear=[0,0],quadratic=[[1,0],[0,-1e-16]])
        self.assertEqual(r['error']['code'],'PSD_UNCERTAIN')


if __name__ == '__main__': unittest.main()
