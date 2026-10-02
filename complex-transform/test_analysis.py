"""Independent known-answer checks for the public analysis contract."""
import json
import subprocess
import unittest
from pathlib import Path
from analysis import dispatch, Expression, Z, pair

EXPRESSIONS = ['z^3', 'conj(z)', 'abs(z)', 'abs(z)^2', 're(z)+i*im(z)',
               '1/z', '1/z^2', '1/(z-0.12345)', '1/((z-1)*(z-2))',
               '(z^2-1)/(z-1)', '(z-1)^3/(z+i)^2', 'exp(1/z)',
               'sin(z)/z', 'exp(z)', 'log(z)', 'sqrt(z)', 'z^(1/3)',
               '1/(1-z)', 'sin(z)', 'z', 'z^2', 'tan(z)', '1', '0',
               'log(z-1)', '1/(z^2+1)', 'exp(2*pi*i*z)', 'asin(z)', 'sinh(z)']
SCRIPT = "const m=require('./math.js'); console.log(JSON.stringify(JSON.parse(process.argv[1]).map(x=>m.compile(x).ast)))"
ASTS = dict(zip(EXPRESSIONS, json.loads(subprocess.check_output(
    ['node', '-e', SCRIPT, json.dumps(EXPRESSIONS)], cwd=Path(__file__).parent, text=True))))


def call(expr, action, **kwargs):
    return dispatch({'ast': ASTS[expr], 'action': action, 'point': {'re': 0, 'im': 0}, **kwargs})['result']


class AnalysisTests(unittest.TestCase):
    def assertComplex(self, actual, expected, tolerance=1e-9):
        self.assertLess(abs(complex(actual['re'], actual['im'])-expected), tolerance)

    def test_local_holomorphic(self):
        r = call('z^3', 'local', point={'re': 1, 'im': 1})
        self.assertTrue(r['holomorphic'])
        self.assertComplex(r['derivativePoint'], 6j)
        self.assertIn('6', r['d2'])
        self.assertTrue(call('z^2', 'local')['critical'])

    def test_wirtinger(self):
        r = call('conj(z)', 'local', point={'re': 1, 'im': 2})
        self.assertFalse(r['holomorphic'])
        self.assertEqual(float(r['wirtinger_bar']['value']), 1)
        self.assertTrue(call('re(z)+i*im(z)', 'local', point={'re': 1, 'im': 2})['holomorphic'])
        self.assertFalse(call('abs(z)^2', 'local')['holomorphic'])

    def test_cut_and_hole_derivatives(self):
        self.assertFalse(call('log(z)', 'local', point={'re': -1, 'im': 0})['holomorphic'])
        self.assertFalse(call('(z^2-1)/(z-1)', 'local', point={'re': 1, 'im': 0})['holomorphic'])

    def test_landmarks(self):
        r = call('(z-1)^3/(z+i)^2', 'landmarks')['items']
        self.assertTrue(any(i['kind'] == 'zero' and i['order'] == 3 for i in r))
        self.assertTrue(any(i['kind'] == 'pole' and i['order'] == 2 for i in r))
        r = call('(z^2-1)/(z-1)', 'landmarks')['items']
        self.assertTrue(any(i['kind'] == 'removable' for i in r))
        r = call('exp(1/z)', 'landmarks')['items']
        self.assertTrue(any(i['kind'] == 'essential' for i in r))
        r = call('log(z-1)', 'landmarks')['items']
        self.assertTrue(any(i['kind'] == 'branch' for i in r))
        r = call('tan(z)', 'landmarks')['items']
        self.assertEqual(len([i for i in r if i['kind'] == 'pole']), 2)

    def test_residues(self):
        self.assertEqual(call('1/z', 'residue')['symbolic'], '1')
        self.assertEqual(call('1/z^2', 'residue')['symbolic'], '0')
        self.assertEqual(call('exp(1/z)', 'residue')['symbolic'], '1')
        self.assertEqual(call('1/z', 'residue', point={'re': 2, 'im': 0})['kind'], 'regular')

    def circle(self, expr, end=360, radius=1):
        return call(expr, 'integral', path={'type': 'circle', 'center': {'re': 0, 'im': 0}, 'radius': radius, 'start': 0, 'end': end})

    def test_integrals(self):
        import math
        for direction in (1, -1):
            r = self.circle('1/z', 360*direction)
            self.assertComplex(r['value'], direction*2j*math.pi)
            self.assertTrue(r['converged'])
            self.assertLess(r['theorem']['difference'], 1e-9)
        self.assertComplex(self.circle('z^2')['value'], 0)
        self.assertComplex(call('z', 'integral', path={'type': 'line', 'points': [{'re': 0, 'im': 0}, {'re': 1, 'im': 1}]})['value'], 1j)
        r = call('conj(z)', 'integral', path={'type': 'circle', 'center': {'re': 0, 'im': 0}, 'radius': 1})
        self.assertComplex(r['value'], 2j*math.pi)

    def test_path_rejections(self):
        with self.assertRaises(ValueError): self.circle('log(z)')
        with self.assertRaises(ValueError): self.circle('1/(z^2+1)')
        with self.assertRaises(ValueError):
            call('1/(z-0.12345)', 'integral', path={'type': 'line', 'points': [{'re': -1, 'im': 0}, {'re': 1, 'im': 0}]})

    def test_parametric_path(self):
        r = call('1/z', 'integral', path={'type': 'parametric', 'ast': ASTS['exp(2*pi*i*z)'], 't0': 0, 't1': 1})
        import math
        self.assertComplex(r['value'], 2j*math.pi)

    def test_series_annuli(self):
        expected = [(0.5, 0, 1), (1.5, 1, 2), (3, 2, None)]
        for radius, inner, outer in expected:
            r = call('1/((z-1)*(z-2))', 'series', radius=radius, order=12)
            self.assertEqual(r['inner'], inner)
            self.assertEqual(r['outer'], outer)
            self.assertTrue(r['radiusKnown'])
        r = call('1/(1-z)', 'series', radius=.5, order=6)
        self.assertTrue(all(i['exact'] == '1' for i in r['coefficients']))
        r = call('1/z^2', 'series')
        self.assertEqual(r['coefficients'], [{'power': -2, 'exact': '1', 'numeric': '1.00000000000000000000000'}])
        r = call('exp(z)', 'series')
        self.assertTrue(r['radiusKnown'])
        with self.assertRaises(ValueError): call('sqrt(z)', 'series')
        with self.assertRaises(ValueError): call('z', 'series', order=1.5)
        r = call('exp(1/z)', 'series')
        self.assertTrue(r['punctured'])
        self.assertTrue(r['radiusKnown'])
        self.assertEqual(next(c['exact'] for c in r['coefficients'] if c['power'] == -1), '1')
        self.assertTrue(call('1/z^2', 'series', order=1)['punctured'])
        self.assertIn('sinh(1)', call('sinh(z)', 'series', point={'re':1,'im':0})['formula'])

    def test_cross_engine_values(self):
        script = "const m=require('./math.js'); console.log(JSON.stringify(JSON.parse(process.argv[1]).map(e=>[e,m.compile(e)(m.C(.7,.5))])))"
        expected = json.loads(subprocess.check_output(['node', '-e', script, json.dumps(EXPRESSIONS)], cwd=Path(__file__).parent, text=True))
        import sympy as s
        for expr, value in expected:
            with self.subTest(expr=expr):
                actual = pair(Expression(ASTS[expr]).expr.subs(Z, s.Rational(7,10)+s.I/2))
                self.assertComplex(actual, complex(value['re'], value['im']))

    def test_branches(self):
        import sympy as s
        model = Expression(ASTS['log(z)'], {'branch': 1, 'cutDegrees': 180})
        self.assertEqual(s.simplify(model.expr.subs(Z, 1)), 2*s.pi*s.I)
        model = Expression(ASTS['sqrt(z)'], {'branch': 1, 'cutDegrees': 180})
        self.assertEqual(s.simplify(model.expr.subs(Z, 4)), -2)
        r = call('log(z-1)', 'branches')
        self.assertComplex(r['cuts'][0]['origin'], 1)

    def test_ast_rejections(self):
        for ast in [{'op': '__import__', 'args': []}, {'literal': '__import__("os")'}, {'literal': '1e99999'}]:
            with self.assertRaises(ValueError): Expression(ast)
        with self.assertRaises(ValueError): Expression(ASTS['z'], {'branch': .5})


if __name__ == '__main__': unittest.main(verbosity=2)
