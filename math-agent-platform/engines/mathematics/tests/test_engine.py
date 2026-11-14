import json
import unittest
from math_engine import execute, catalogue
from math_engine.protocol import RESPONSE_SCHEMA, validate


class EngineTests(unittest.TestCase):
    def call(self, tool, **args):
        response = execute({'schemaVersion': 1, 'tool': tool, 'arguments': args})
        validate(response, RESPONSE_SCHEMA)
        return response

    def optimization(self, **args):
        r = self.call('convex_optimize', **args)
        self.assertTrue(r['ok'], r)
        return r['value']

    def test_exact_semantics(self):
        for source, kind, value in [('1/3+1/6','value','1/2'), ('0.1+0.2','value','3/10'),
                                    ('2(x+3)=4x-1','unique','7/2'), ('x=x','identity',None),
                                    ('x=x+1','no-solution',None), ('1=1','identity',None),
                                    ('$$−2×(3+4)$$','value','-14'), ('.25/.5','value','1/2')]:
            r=self.call('exact_math', expression=source)
            self.assertTrue(r['ok'], r)
            result=r['value']['result']['candidate']
            self.assertEqual((result['kind'],result.get('value')),(kind,value))
            self.assertEqual(r['value']['verification']['status'],'passed')

    def test_exact_rejects_unsafe_and_unsupported(self):
        for source in ['x*x=1','1/x=2','1/0','__import__("os")','x+y=2','2**3','sin(x)', '(x-x)*x=0']:
            self.assertFalse(self.call('exact_math',expression=source)['ok'],source)

    def test_protocol_validation(self):
        for request in [{'schemaVersion':2,'tool':'exact_math','arguments':{'expression':'1'}},
                        {'schemaVersion':1,'tool':'exact_math','arguments':{'expression':'1','code':'bad'}},
                        {'schemaVersion':1,'tool':'convex_optimize','arguments':{'operation':'linear_program','linear':[float('nan')]}},
                        {'schemaVersion':1,'tool':'unknown','arguments':{}}]:
            r=execute(request);self.assertFalse(r['ok']);validate(r,RESPONSE_SCHEMA)
        self.assertEqual(len(catalogue()),6)

    def test_lp_primal_dual_and_table(self):
        v=self.optimization(operation='linear_program',linear=[1,2],inequalityMatrix=[[-1,-1]],inequalityBounds=[-1],lower=[0,0])
        self.assertEqual(v['result']['status'],'optimal')
        self.assertAlmostEqual(v['result']['objective'],1,places=5)
        self.assertLess(v['result']['maxConstraintViolation'],1e-6)
        self.assertEqual(v['views'][0]['kind'],'table')
        self.assertEqual(len(v['result']['duals']),2)

    def test_qp_and_least_squares(self):
        v=self.optimization(operation='quadratic_program',linear=[-2,-4],quadratic=[[2,0],[0,2]],lower=[0,0])
        self.assertAlmostEqual(v['result']['objective'],-5,places=6)
        v=self.optimization(operation='least_squares',design=[[1,0],[0,1]],target=[3,4],equalityMatrix=[[1,1]],equalityBounds=[1])
        self.assertAlmostEqual(sum(v['result']['values']),1,places=6)
        self.assertAlmostEqual(v['result']['objective'],18,places=5)

    def test_soc(self):
        v=self.optimization(operation='second_order_cone',linear=[0,1],equalityMatrix=[[1,0]],equalityBounds=[3],
                            cones=[{'matrix':[[1,0]],'offset':[0],'axis':[0,1],'bound':0}])
        self.assertAlmostEqual(v['result']['objective'],3,places=5)

    def test_infeasible_and_unbounded(self):
        v=self.optimization(operation='linear_program',linear=[1],lower=[2],upper=[1])
        self.assertEqual(v['result']['status'],'infeasible');self.assertIsNone(v['result']['values'])
        v=self.optimization(operation='linear_program',linear=[-1])
        self.assertEqual(v['result']['status'],'unbounded');self.assertIsNone(v['result']['objective'])

    def test_nonconvex_and_dimensions_rejected(self):
        cases=[dict(operation='quadratic_program',linear=[0],quadratic=[[-1]]),
               dict(operation='quadratic_program',linear=[0,0],quadratic=[[1,1],[0,1]]),
               dict(operation='linear_program',linear=[1,2],lower=[0]),
               dict(operation='linear_program',linear=[1],inequalityMatrix=[[1]]),
               dict(operation='linear_program',linear=[1],quadratic=[[1]]),
               dict(operation='second_order_cone',linear=[1])]
        for case in cases:self.assertFalse(self.call('convex_optimize',**case)['ok'],case)


if __name__=='__main__': unittest.main()
