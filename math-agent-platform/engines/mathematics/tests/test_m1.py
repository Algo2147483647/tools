import unittest
import sympy as sp
from math_engine import execute
from math_engine.ir import parse,lower,encode,validate_ir
from math_engine.protocol import validate,RESPONSE_SCHEMA


def integer(n):return {'kind':'Integer','value':str(n)}
def interval(a,b,left=False,right=False):return dict(kind='Interval',start=integer(a),end=integer(b),leftOpen=left,rightOpen=right)


class M1Tests(unittest.TestCase):
    def call(self,tool,**args):
        r=execute(dict(schemaVersion=2,tool=tool,arguments=args));validate(r,RESPONSE_SCHEMA);return r
    def value(self,tool,**args):
        r=self.call(tool,**args);self.assertTrue(r['ok'],r);return r['value']
    def algebra(self,op,expression,**args):return self.value('algebra_math',operation=op,expression=expression,**args)

    def test_parse_roundtrip(self):
        for text in ['1/3+1e-30','(x^2-1)/(x-1)','sqrt(x^2)','-2^2','2^3^2','9007199254740993']:
            v=self.value('structure_math',expression=text)
            reread=self.value('structure_math',ir=v['result']['ir'])
            self.assertEqual(v['result']['ir'],reread['result']['ir'])
            self.assertEqual(v['result']['domain'],reread['result']['domain'])

    def test_latex(self):
        cases={r'\frac{1}{3}+\frac{1}{6}':sp.Rational(1,2),r'\sqrt{8}':2*sp.sqrt(2),r'2x^{2}':2*sp.Symbol('x',real=True)**2,
               r'\sin(\pi/2)':1,r'x_{12}+1':sp.Symbol('x_12',real=True)+1}
        for text,expected in cases.items():
            v=self.value('structure_math',expression=text,format='latex')
            self.assertEqual(sp.simplify(lower(v['result']['ir'])-expected),0)
        v=self.value('structure_math',expression=r'\begin{bmatrix}1&\frac{1}{2}\\3&4\end{bmatrix}',format='latex')
        self.assertEqual(sp.simplify(lower(v['result']['ir'])),sp.ImmutableMatrix([[1,sp.Rational(1,2)],[3,4]]))

    def test_latex_rejects_ambiguity_and_partial_input(self):
        for text in [r'\sin x',r'\sqrt[3]{8}',r'\unknown{x}',r'\frac{1}',r'x^{2',r'\begin{matrix}1&2\\3\end{matrix}',r'\frac{1}{2}junk!',r'\left(x\right)']:
            r=self.call('structure_math',expression=text,format='latex')
            self.assertFalse(r['ok'],text);self.assertIn('offset',r['error']['message'])

    def test_domain_preserved_after_cancellation(self):
        v=self.value('symbolic_math',operation='simplify',expression='(x^2-1)/(x-1)')
        self.assertEqual(v['result']['expression'],'x + 1')
        self.assertTrue(any('Ne(x, 1)' in c for c in v['result']['domain']['conditions']))
        v=self.value('symbolic_math',operation='solve',expression='(x^2-1)/(x-1)=2')
        self.assertEqual(v['result']['expression'],'EmptySet')
        self.assertEqual(v['result']['legacyState'],'no_solution')

    def test_domain_undefined_and_unknown(self):
        for text in ['0/0','sqrt(-1)','log(0)']:
            self.assertFalse(self.call('structure_math',expression=text)['ok'])
        v=self.value('structure_math',expression='x^y')
        self.assertFalse(v['result']['domain']['analysisComplete'])
        v=self.value('symbolic_math',operation='differentiate',expression='sqrt(x)')
        self.assertTrue(any('x > 0' in c for c in v['result']['domain']['conditions']))
        r=self.call('numeric_math',operation='integrate',expression='sqrt(x)^0',interval=[-2,-1])
        self.assertEqual(r['error']['code'],'DOMAIN_ERROR')
        from math_engine.common import expression,numeric_function,symbol
        import numpy as np
        source='abs(sqrt(x))'
        values=numeric_function(expression(source),symbol('x'),source)(np.array([-1.,1.]))
        self.assertTrue(np.isnan(values[0]));self.assertEqual(values[1],1)

    def test_mathir_validation(self):
        for tree in [dict(kind='Integer',value=123),dict(kind='Rational',numerator='1',denominator='0'),
                     dict(kind='Symbol',name='__import__'),dict(kind='Integer',value='1',code='bad'),dict(kind='Add',args=[integer(1)])]:
            self.assertFalse(self.call('structure_math',ir=tree)['ok'])

    def test_ir_reused_by_computational_tools(self):
        tree=self.value('structure_math',expression=r'\frac{x^2-1}{x-1}',format='latex')['result']['ir']
        value=self.value('symbolic_math',operation='simplify',ir=tree)
        self.assertEqual(value['result']['expression'],'x + 1')
        self.assertTrue(value['result']['domain']['conditions'])
        # A transformed result must retain restrictions when reused by another call.
        again=self.value('symbolic_math',operation='simplify',ir=value['result']['ir'])
        self.assertEqual(again['result']['domain']['conditions'],value['result']['domain']['conditions'])
        tree=self.value('structure_math',expression='1/3+1/6')['result']['ir']
        self.assertEqual(self.value('exact_math',ir=tree)['result']['candidate']['value'],'1/2')
        a=self.algebra('minimal_polynomial','sqrt(2)')['result']['ir']
        value=self.value('algebra_math',operation='algebraic_multiply',ir=a,otherIR=a)
        self.assertEqual(sp.simplify(lower(value['result']['ir'])),2)
        self.assertFalse(self.call('symbolic_math',operation='simplify',expression='1',ir=tree)['ok'])

    def test_polynomial_budgets_and_integer_ring_division(self):
        r=self.call('algebra_math',operation='factor',expression='((x+1)^20+1)^20')
        self.assertEqual(r['error']['code'],'RESOURCE_LIMIT')
        r=self.call('algebra_math',operation='divide',expression='2*x',other='3*x',coefficientDomain='ZZ')
        self.assertEqual(r['error']['code'],'UNSUPPORTED')
        result=self.algebra('divide','2*x',other='3*x')['result']
        self.assertEqual(lower(result['quotient']),sp.Rational(2,3))

    def test_exact_scientific_and_latex(self):
        for text,fmt,expected in [('1e-30+2e-30','ascii','3/1000000000000000000000000000000'),
                                 (r'\frac{1}{3}+\frac{1}{6}','latex','1/2'),('9007199254740993+1','ascii','9007199254740994')]:
            v=self.value('exact_math',expression=text,format=fmt)
            self.assertEqual(v['result']['candidate']['value'],expected)

    def test_rounding_and_mod(self):
        cases=[('floor','-7/3',{},'-3'),('ceil','-7/3',{},'-2'),('truncate','-7/3',{},'-2'),
               ('mod','-7',{'other':'3'},'2'),('mod','7',{'other':'-3'},'-2'),
               ('compare','9007199254740993',{'other':'9007199254740992'},'1'),
               ('round','5/2',{},'2'),('round','-5/2',{'rounding':'half_away_from_zero'},'-3'),
               ('round','1250',{'digits':-2},'1200'),('round','1.235',{'digits':2},'31/25')]
        for op,text,extra,expected in cases:
            v=self.value('exact_math',operation=op,expression=text,**extra)
            self.assertEqual(v['result']['value'],expected)
            validate_ir(v['result']['ir'])
        self.assertFalse(self.call('exact_math',operation='mod',expression='1',other='0')['ok'])
        self.assertFalse(self.call('exact_math',operation='floor',expression='1',other='2')['ok'])

    def test_algebraic_operations_and_roundtrip(self):
        cases=[('algebraic_add','sqrt(2)','sqrt(8)',3*sp.sqrt(2)),('algebraic_multiply','sqrt(2)','sqrt(2)',2),
               ('algebraic_divide','1','sqrt(2)',sp.sqrt(2)/2),('algebraic_subtract','sqrt(2)','sqrt(2)',0)]
        for op,a,b,expected in cases:
            v=self.algebra(op,a,other=b);ir=v['result']['ir']
            again=self.value('structure_math',ir=ir)
            self.assertEqual(sp.simplify(lower(again['result']['ir'])-expected),0)
            self.assertTrue(v['result']['algebraic']['exact'])
        self.assertTrue(self.algebra('algebraic_equal','sqrt(8)',other='2*sqrt(2)')['result']['equal'])
        self.assertFalse(self.algebra('algebraic_equal','sqrt(2)',other='-sqrt(2)')['result']['equal'])

    def test_minimal_polynomial(self):
        v=self.algebra('minimal_polynomial','sqrt(2)+sqrt(3)')
        self.assertEqual(v['result']['ir']['polynomial'],['1','0','-10','0','1'])
        self.assertEqual(v['result']['ir']['realRootIndex'],3)
        for text in ['pi','x','sqrt(-1)']:
            self.assertFalse(self.call('algebra_math',operation='minimal_polynomial',expression=text)['ok'])

    def test_radicals_preserve_real_branch(self):
        v=self.algebra('radical_simplify','sqrt(x^2)')
        self.assertEqual(v['result']['expression'],'Abs(x)')

    def test_polynomial_division_and_gcd(self):
        v=self.algebra('divide','x^3-1',other='x-1')['result']
        self.assertEqual(sp.simplify(lower(v['quotient'])),sp.Symbol('x',real=True)**2+sp.Symbol('x',real=True)+1)
        self.assertEqual(lower(v['remainder']),0)
        v=self.algebra('gcd','x^3-x',other='x^2-1')['result'];self.assertEqual(sp.simplify(lower(v['ir'])),sp.Symbol('x',real=True)**2-1)
        self.assertFalse(self.call('algebra_math',operation='divide',expression='x',other='0')['ok'])
        self.assertFalse(self.call('algebra_math',operation='factor',expression='sin(x)')['ok'])
        self.assertFalse(self.call('algebra_math',operation='factor',expression='x^21')['ok'])

    def test_factorization_and_multiplicities(self):
        for op in ['factor','square_free']:
            v=self.algebra(op,'(x-1)^3*(x+2)^2')
            self.assertEqual(sorted(f['multiplicity'] for f in v['result']['factors']),[2,3])
            self.assertEqual(v['verification']['status'],'passed')

    def test_resultant(self):
        v=self.algebra('resultant','x^2-y',other='x-1',variables=['x','y'],eliminate='x')
        self.assertEqual(sp.expand(lower(v['result']['ir'])),1-sp.Symbol('y',real=True))

    def test_root_isolation(self):
        v=self.algebra('isolate_roots','(x-1)^2*(x^2-2)')['result']
        self.assertEqual(len(v['roots']),3);self.assertEqual([r['multiplicity'] for r in v['roots']],[1,2,1])
        self.assertEqual(v['completeness'],'complete')
        self.assertFalse(self.call('algebra_math',operation='isolate_roots',expression='0')['ok'])

    def test_set_endpoints_and_roundtrip(self):
        v=self.value('set_math',operation='intersection',set=interval(0,2),other=interval(1,3,True))
        expected=interval(1,2,True);self.assertEqual(v['result']['ir'],expected)
        again=self.value('structure_math',ir=v['result']['ir']);self.assertEqual(again['result']['ir'],expected)
        empty=self.value('set_math',operation='intersection',set=interval(0,1,False,True),other=interval(1,2))
        self.assertEqual(empty['result']['ir'],{'kind':'EmptySet'})

    def test_complement_requires_universe(self):
        finite=dict(kind='FiniteSet',elements=[integer(1)])
        self.assertFalse(self.call('set_math',operation='complement',set=finite)['ok'])
        v=self.value('set_math',operation='complement',set=finite,universe=dict(kind='Universe',name='Reals'))
        self.assertEqual(v['result']['ir']['kind'],'Union')
        decoded=lower(v['result']['ir']);self.assertFalse(decoded.contains(1));self.assertTrue(decoded.contains(2))
        self.assertFalse(self.call('set_math',operation='complement',set=interval(0,1),universe=dict(kind='Universe',name='Integers'))['ok'])

    def test_set_validation(self):
        for tree in [interval(2,1),dict(kind='Interval',start='-inf',end=integer(1),leftOpen=False,rightOpen=False),
                     dict(kind='FiniteSet',elements=[dict(kind='Symbol',name='x')])]:
            self.assertFalse(self.call('set_math',operation='normalize',set=tree)['ok'])


if __name__=='__main__':unittest.main()
