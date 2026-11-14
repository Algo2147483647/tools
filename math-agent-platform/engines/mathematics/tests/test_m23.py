"""M2/M3 regressions; intentionally reserved for the combined validation phase."""
import unittest
import sympy as sp
from math_engine import solve
from math_engine.protocol import validate,RESPONSE_SCHEMA
from math_engine.ir import lower


class M23Tests(unittest.TestCase):
    def call(self,tool,**args):
        reply=solve(tool=tool,arguments=args,schema_version=2);validate(reply,RESPONSE_SCHEMA);return reply
    def value(self,tool,**args):
        reply=self.call(tool,**args);self.assertTrue(reply['ok'],reply);return reply['value']

    def test_single_equation_excludes_original_hole(self):
        v=self.value('equation_math',operation='single',equations=['(x^2-1)/(x-1)=2'],variables=['x'])
        self.assertEqual(v['result']['solutionKind'],'empty')

    def test_radical_equation_checks_original(self):
        v=self.value('equation_math',operation='single',equations=['sqrt(x+2)=x'],variables=['x'])
        self.assertEqual(v['result']['expression'],'{2}')
        self.assertTrue(all(c['verification']=='verified' for c in v['result']['candidates']))

    def test_parameter_branches(self):
        v=self.value('equation_math',operation='linear_system',equations=['a*x+y=1','x+a*y=1'],variables=['x','y'],parameters=['a'])
        branches={b['condition']:b['solutionKind'] for b in v['result']['branches']}
        self.assertEqual(branches['Eq(a, -1)'],'empty');self.assertEqual(branches['Eq(a, 1)'],'parametric')
        self.assertEqual(v['result']['completeness'],'complete')

    def test_inconsistent_generic_parameter_has_special_solution(self):
        v=self.value('equation_math',operation='linear_system',equations=['a*x=0','a=0'],variables=['x'],parameters=['a'])
        branch=next(b for b in v['result']['branches'] if b['condition']=='Eq(a, 0)')
        self.assertEqual(branch['solutionKind'],'parametric')

    def test_polynomial_system_and_positive_dimension(self):
        v=self.value('equation_math',operation='polynomial_system',equations=['x^2+y^2=5','x*y=2'],variables=['x','y'])
        self.assertEqual(len(v['result']['solutions']),4)
        v=self.value('equation_math',operation='polynomial_system',equations=['x*y=0'],variables=['x','y'])
        self.assertEqual(v['result']['state'],'unresolved')

    def test_inequality_endpoints(self):
        v=self.value('equation_math',operation='inequalities',variables=['x'],inequalities=[dict(left='(x-1)/(x+2)',relation='>=',right='0')])
        result=lower(v['result']['ir'])
        self.assertFalse(result.contains(-2));self.assertTrue(result.contains(1));self.assertFalse(result.contains(0))

    def test_exact_matrix_identity(self):
        v=self.value('matrix_math',operation='inverse',matrix=[['1','1/2'],['1/2','1/3']])
        self.assertEqual(sp.simplify(sp.Matrix([[1,sp.Rational(1,2)],[sp.Rational(1,2),sp.Rational(1,3)]])*lower(v['result']['ir'])),sp.eye(2))
        self.assertEqual(v['verification']['status'],'passed')

    def test_exact_matrix_parameter_and_nullspace(self):
        for operation in ('solve','nullspace'):
            args=dict(operation=operation,matrix=[['1','2','3'],['2','4','6']])
            if operation=='solve':args['vector']=['1','2']
            v=self.value('matrix_math',**args);self.assertEqual(v['verification']['status'],'passed')
        self.assertFalse(self.call('matrix_math',operation='inverse',matrix=[[0.1,0],[0,1]])['ok'])

    def test_numeric_decompositions(self):
        for operation in ('qr','svd'):
            v=self.value('matrix_math',operation=operation,matrix=[[1,2],[3,4],[5,6]])
            self.assertEqual(v['verification']['status'],'passed')
        v=self.value('matrix_math',operation='least_squares',matrix=[[1,0],[1,1],[1,2]],vector=[1,2,4])
        self.assertGreater(v['result']['residualNorm'],0);self.assertEqual(v['verification']['status'],'passed')

    def test_sparse_never_requires_dense_condition_number(self):
        v=self.value('matrix_math',operation='sparse_solve',sparse=dict(shape=[2,2],rows=[0,1],columns=[0,1],values=[2,3]),vector=[4,9])
        self.assertIsNone(v['diagnostics']['conditionNumber']);self.assertEqual(v['verification']['status'],'passed')

    def test_multiple_roots_and_partial_scan(self):
        v=self.value('numeric_math',operation='roots',expression='(x-1)^4*(x+2)^2',interval=[-3,3])
        self.assertEqual(v['result']['completeness'],'complete');self.assertEqual([r['multiplicity'] for r in v['result']['roots']],[2,4])
        v=self.value('numeric_math',operation='roots',expression='cos(x)-1',interval=[-3,3],samples=20)
        self.assertEqual(v['result']['completeness'],'partial')

    def test_derivative_shapes_and_implicit_conditions(self):
        v=self.value('calculus_math',operation='hessian',expression='exp(x*y)+x^2*y',variables=['x','y'],verifyAt=[0.2,0.3])
        self.assertEqual(v['result']['shape'],[2,2]);self.assertEqual(v['verification']['status'],'passed')
        v=self.value('calculus_math',operation='implicit_derivative',expression='x^2+y^2=1',variables=['x','y'])
        self.assertEqual(v['result']['ir']['kind'],'Conditioned')
        parsed=self.value('structure_math',ir=v['result']['ir'])
        self.assertTrue(any('Eq(' in c for c in parsed['result']['domain']['conditions']))

    def test_integral_convergence_and_order(self):
        v=self.value('calculus_math',operation='integrate',expression='1/x',variables=['x'],limits=[dict(variable='x',lower='-1',upper='1')])
        self.assertEqual(v['result']['convergence'],'divergent')
        v=self.value('calculus_math',operation='integrate',expression='x+y',variables=['x','y'],limits=[dict(variable='x',lower='0',upper='y'),dict(variable='y',lower='0',upper='1')])
        self.assertEqual(v['result']['expression'],'1/2')

    def test_piecewise_domains_do_not_leak(self):
        v=self.value('calculus_math',operation='piecewise_integrate',variables=['x'],segments=[dict(expression='x^2',lower='-1',upper='0'),dict(expression='1/sqrt(x)',lower='0',upper='1')])
        self.assertEqual(v['result']['expression'],'7/3')
        r=self.call('calculus_math',operation='integrate',expression='sqrt(x)^0',variables=['x'],limits=[dict(variable='x',lower='-2',upper='-1')])
        self.assertEqual(r['error']['code'],'DOMAIN_ERROR')

    def test_numerical_integral_does_not_certify_convergence(self):
        v=self.value('calculus_math',operation='integrate',mode='numeric',expression='exp(-x)',variables=['x'],limits=[dict(variable='x',lower='0',upper='inf')])
        self.assertEqual(v['result']['convergence'],'unknown');self.assertEqual(v['result']['errorBoundKind'],'estimated')

    def test_named_model_full_objective(self):
        v=self.value('convex_model',operation='solve',variables=[dict(name='x',shape=[2],lower=0)],objective=dict(expression=dict(kind='add',args=[dict(kind='sum_squares',args=[dict(kind='subtract',args=[dict(kind='variable',name='x'),dict(kind='constant',value=[1,2])])]),dict(kind='constant',value=7)])))
        self.assertAlmostEqual(v['result']['objective'],7,places=6);self.assertIn('x',v['result']['values'])

    def test_lp_certificates(self):
        for args,kind in [(dict(linear=[1],lower=[2],upper=[1]),'farkas'),(dict(linear=[-1],lower=[0]),'unbounded_ray')]:
            v=self.value('convex_optimize',operation='linear_program',**args)
            cert=v['diagnostics']['certificate'];self.assertEqual(cert['status'],'verified');self.assertEqual(cert['witness']['kind'],kind)


if __name__=='__main__':unittest.main()
