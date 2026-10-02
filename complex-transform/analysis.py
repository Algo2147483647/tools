"""Complex analysis engine. Only a validated mathematical AST crosses the API.

SymPy expressions are constructed from a whitelist; user text is never passed to
eval, sympify or parse_expr. Numerical estimates are explicitly not certificates.
"""
import math
import re
import cmath
import sympy as s
import mpmath as mp

Z = s.Symbol('z')
X, Y, T = s.symbols('x y t', real=True)
NONHOLO = {'re', 'im', 'conj', 'abs', 'arg', 'complex'}
FUNCS = {name: getattr(s, name) for name in
         ('exp', 'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan')}
FUNCS.update(re=s.re, im=s.im, conj=s.conjugate, abs=s.Abs, arg=s.arg)


def real_number(value, name='number', low=-1e8, high=1e8):
    if isinstance(value, bool):
        raise ValueError(f'{name}: invalid number')
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}')
    return value


def point(value):
    return s.Rational(str(real_number(value['re']))) + s.I*s.Rational(str(real_number(value['im'])))


def pair(value):
    try:
        v = complex(s.N(value, 17))
        return {'re': v.real, 'im': v.imag} if math.isfinite(abs(v)) else None
    except (TypeError, ValueError, OverflowError):
        return None


def number(value, digits=24):
    try:
        value = s.N(value, digits)
        if value.has(s.zoo, s.nan, s.oo, -s.oo) or value.free_symbols:
            return None
        return str(value)
    except (ValueError, TypeError, NotImplementedError):
        return None


class Expression:
    def __init__(self, ast, options=None):
        options = options or {}
        self.cut = real_number(options.get('cutDegrees', 180), 'cut angle', -180, 180)
        self.branch = int(real_number(options.get('branch', 0), 'branch', -100, 100))
        if self.branch != float(options.get('branch', 0)):
            raise ValueError('Branch must be an integer')
        self.exclusions, self.cuts, self.ops = [], [], set()
        self.count = 0
        self.expr = self.build(ast)

    def logarithm(self, a, exclude_zero=True):
        if exclude_zero: self.exclusions.append(a)
        self.cuts.append((a, self.cut))
        shift = s.pi * s.Rational(str(self.cut - 180)) / 180
        return s.log(a*s.exp(-s.I*shift)) + s.I*(shift + 2*s.pi*self.branch)

    def build(self, node, depth=0):
        self.count += 1
        if self.count > 256 or depth > 48 or not isinstance(node, dict):
            raise ValueError('Expression exceeds the AST budget')
        if node.get('variable') is True:
            return Z
        if 'constant' in node:
            constants = {'i': s.I, 'pi': s.pi, 'e': s.E, 'tau': 2*s.pi}
            if node['constant'] not in constants:
                raise ValueError('Unknown constant')
            return constants[node['constant']]
        if 'literal' in node:
            text = node['literal']
            if not isinstance(text, str) or len(text) > 64 or not re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', text):
                raise ValueError('Invalid numeric literal')
            if not math.isfinite(float(text)) or ('e' in text.lower() and abs(int(text.lower().split('e')[1])) > 300):
                raise ValueError('Literal exceeds supported range')
            return s.Rational(text)
        op, children = node.get('op'), node.get('args', [])
        arity = 2 if op in {'+', '-', '*', '/', '^', 'pow', 'complex'} else 1
        if op not in set(FUNCS) | {'+', '-', '*', '/', '^', 'pow', 'complex', 'neg', 'log', 'ln', 'sqrt'} or len(children) != arity:
            raise ValueError('Unknown operator or invalid arity')
        self.ops.add(op)
        args = [self.build(child, depth + 1) for child in children]
        a = args[0]
        if op == '+': return a + args[1]
        if op == '-': return a - args[1]
        if op == '*': return a * args[1]
        if op == '/':
            self.exclusions.append(args[1])
            return a / args[1]
        if op == 'neg': return -a
        if op in {'log', 'ln'}: return self.logarithm(a)
        if op in {'sqrt', '^', 'pow'}:
            b = s.Rational(1, 2) if op == 'sqrt' else args[1]
            if b.is_integer:
                if b.is_number and abs(b) > 128:
                    raise ValueError('Analysis supports integer powers up to 128')
                if b.is_negative: self.exclusions.append(a)
                return a ** b
            log = self.logarithm(a, not (b.is_real and b.is_positive))
            # Preserve ordinary powers so SymPy retains their algebraic structure.
            return a**b if self.cut == 180 and self.branch == 0 else s.exp(b*log)
        if op == 'complex':
            if any(s.im(v).equals(0) is not True for v in args):
                raise ValueError('complex(real, imaginary) requires real-valued arguments')
            return a + s.I*args[1]
        if op == 'arg':
            self.exclusions.append(a)
            self.cuts.append((a, 180))
        if op in {'asin', 'acos', 'atan'}:
            # These keep their standard principal branches, as in the browser.
            self.cuts.append((a, op))
        return FUNCS[op](*args)

    def domain_issue(self, z):
        for ex in self.exclusions:
            if s.simplify(ex.subs(Z, z)) == 0:
                return 'Undefined at this point'
        if pair(self.expr.subs(Z, z)) is None:
            return 'Value unavailable'
        for arg, cut in self.cuts:
            p = pair(arg.subs(Z, z))
            if p is None: continue
            w = complex(p['re'], p['im'])
            if cut in ('asin', 'acos'):
                on_cut = abs(w.imag) < 1e-12 and abs(w.real) >= 1
            elif cut == 'atan':
                on_cut = abs(w.real) < 1e-12 and abs(w.imag) >= 1
            else:
                u = w*cmath.exp(-1j*math.radians(cut))
                on_cut = u.real >= 0 and abs(u.imag) < 1e-12*max(1, abs(w))
            if on_cut:
                return 'On a branch cut or branch point'
        return None

    @property
    def holomorphic_syntax(self):
        return not bool(self.ops & NONHOLO)


def polynomial_roots(expr):
    """All roots, with multiplicity; exact where available, numerical otherwise."""
    poly = s.Poly(expr, Z)
    if poly.is_zero:
        raise ValueError('The zero polynomial has non-isolated zeros')
    if poly.degree() > 24:
        raise ValueError('Polynomial degree limit: 24')
    if poly.degree() <= 0: return []
    exact = s.roots(poly.as_expr(), Z)
    if sum(exact.values()) == poly.degree():
        return [(p, int(n), True) for p, n in exact.items()]
    result = []
    for factor, multiplicity in s.sqf_list(poly)[1]:
        result.extend((p, int(multiplicity), False) for p in s.nroots(factor, n=25, maxsteps=150))
    return result


def finite_singularities(expr, bounds=None):
    result = s.singularities(expr, Z)
    def enumerate_set(values):
        if isinstance(values, s.FiniteSet): return list(values)
        if isinstance(values, s.Union): return [p for arg in values.args for p in enumerate_set(arg)]
        if bounds and isinstance(values, s.ImageSet) and values.base_set == s.S.Integers:
            variable = values.lamda.variables[0]
            formula = values.lamda.expr
            if formula.is_polynomial(variable) and s.degree(formula, variable) == 1:
                origin = complex(s.N(formula.subs(variable, 0)))
                step = complex(s.N(s.diff(formula, variable)))
                low, high = -math.inf, math.inf
                for offset, delta, lo, hi in [(origin.real, step.real, bounds['left'], bounds['right']),
                                               (origin.imag, step.imag, bounds['bottom'], bounds['top'])]:
                    if abs(delta) < 1e-15:
                        if not lo <= offset <= hi: return []
                    else:
                        edges = sorted([(lo-offset)/delta, (hi-offset)/delta])
                        low, high = max(low, edges[0]), min(high, edges[1])
                if not math.isfinite(low) or not math.isfinite(high) or high < low: return []
                if high-low > 200: raise ValueError('More than 200 periodic singularities; reduce the region')
                return [formula.subs(variable, n) for n in range(math.ceil(low-1e-12), math.floor(high+1e-12)+1)]
        return []
    return enumerate_set(result)


def is_entire(expr, variable):
    if expr.is_polynomial(variable): return True
    if expr.func in (s.Add, s.Mul): return all(is_entire(a, variable) for a in expr.args)
    if expr.func in (s.exp, s.sin, s.cos, s.sinh, s.cosh): return is_entire(expr.args[0], variable)
    if expr.is_Pow and expr.exp.is_integer and expr.exp.is_nonnegative: return is_entire(expr.base, variable)
    return False


def symbolic_residue(expr, a):
    try:
        return s.residue(expr, Z, a)
    except (NotImplementedError, s.PoleError):
        h = s.Symbol('h')
        reciprocal = s.simplify(expr.subs(Z, a+1/h))
        # If the reciprocal expression is entire, its Taylor series gives a
        # Laurent series valid on the whole punctured plane around a.
        if is_entire(reciprocal, h):
            return s.diff(reciprocal, h).subs(h, 0)
        raise ValueError('Symbolic residue unavailable')


def classify(expr, a):
    if expr.is_rational_function(Z):
        num, den = s.fraction(s.cancel(expr))
        if s.simplify(den.subs(Z, a)) == 0:
            order = 0
            while order < 128 and s.simplify(den.subs(Z, a)) == 0:
                den = s.diff(den, Z)
                order += 1
            return 'pole', order
        return 'regular', 0
    try:
        h = s.Symbol('h', positive=True)
        lead = expr.subs(Z, a + h).as_leading_term(h)
        exponent = lead.as_powers_dict().get(h, s.S.Zero)
        if exponent.is_integer and exponent < 0:
            return 'pole', int(-exponent)
        if not lead.has(s.sin, s.cos, s.exp, s.log) and exponent.is_nonnegative:
            return 'removable', 0
    except (ValueError, NotImplementedError, s.PoleError):
        pass
    for atom in expr.atoms(s.exp, s.sin, s.cos, s.sinh, s.cosh):
        if atom.args[0].is_rational_function(Z):
            _, den = s.fraction(s.cancel(atom.args[0]))
            if s.simplify(den.subs(Z, a)) == 0 and expr == atom:
                return 'essential', None
    return 'unknown', None


def local(model, data):
    a = point(data['point'])
    f = model.expr
    issue = model.domain_issue(a)
    if model.holomorphic_syntax:
        dz, dbar = s.diff(f, Z), s.S.Zero
        fx, fy = dz, s.I*dz
        cr_zero = True
        at = lambda e: e.subs(Z, a)
    else:
        real_form = s.expand_complex(f.subs(Z, X+s.I*Y))
        fx, fy = s.diff(real_form, X), s.diff(real_form, Y)
        dz, dbar = s.simplify((fx-s.I*fy)/2), s.simplify((fx+s.I*fy)/2)
        cr_zero = dbar == 0
        at = lambda e: e.subs({X: s.re(a), Y: s.im(a)})
    holomorphic = cr_zero and issue is None
    dval = at(dz)
    result = {
        'method': 'Symbolic differentiation; 24-digit display',
        'value': number(f.subs(Z, a)), 'issue': issue,
        'status': ('Holomorphic on the regular domain' if holomorphic else issue or 'Local analyticity unverified'),
        'holomorphic': holomorphic,
        'partials': {key: {'formula': str(expr), 'value': number(at(expr))} for key, expr in
                     [('u_x', s.re(fx)), ('u_y', s.re(fy)), ('v_x', s.im(fx)), ('v_y', s.im(fy))]},
        'wirtinger_z': {'formula': str(dz), 'value': number(dval)},
        'wirtinger_bar': {'formula': str(dbar), 'value': number(at(dbar))},
        'cr': [number(at(s.re(fx)-s.im(fy))), number(at(s.im(fx)+s.re(fy)))],
    }
    if holomorphic:
        second = s.diff(f, Z, 2) if model.holomorphic_syntax else s.diff(dz, X)
        result.update(derivative=str(dz), second=str(second), d1=number(dval),
                      d2=number(at(second)), scale=number(s.Abs(dval)),
                      rotation=number(s.arg(dval)) if dval != 0 else None,
                      critical=s.simplify(dval) == 0,
                      linear=f'f(z₀) + ({number(dval)}) · (z − z₀)',
                      derivativePoint=pair(dval))
    return result


def landmarks(model, data):
    f = model.expr
    bounds = data.get('bounds', {'left': -2, 'right': 2, 'bottom': -2, 'top': 2})
    b = {k: real_number(bounds[k], k) for k in ('left', 'right', 'bottom', 'top')}
    if b['left'] >= b['right'] or b['bottom'] >= b['top']:
        raise ValueError('Invalid search bounds')
    def inside(a):
        p = pair(a)
        return p and b['left']-1e-10 <= p['re'] <= b['right']+1e-10 and b['bottom']-1e-10 <= p['im'] <= b['top']+1e-10
    items, seen = [], []
    def add(a, kind, order=None, exact=True):
        if not inside(a): return
        if any(k == kind and (a == prev or (not rational and not exact and abs(complex(s.N(a-prev))) < 1e-8)) for prev, k in seen): return
        seen.append((a, kind))
        items.append({'point': pair(a), 'position': str(a), 'kind': kind, 'order': order,
                      'exact': exact, 'residual': number(s.Abs(f.subs(Z, a))) if kind in ('zero', 'zero-candidate') else None})
    rational = f.is_rational_function(Z)
    status = 'Complete' if rational else 'Partial'
    note = 'Rational root enumeration; numerical roots marked approximate.'
    if rational:
        num, den = s.fraction(s.cancel(f))
        if num == 0:
            note = 'Identically zero on the original domain.'
            status = 'Non-isolated zeros'
        for a, n, exact in ([] if num == 0 else polynomial_roots(num)):
            if model.domain_issue(a) is None: add(a, 'zero', n, exact)
        for a, n, exact in polynomial_roots(den): add(a, 'pole', n, exact)
        derivative_num = s.fraction(s.cancel(s.diff(f, Z)))[0]
        if derivative_num != 0:
            for a, n, exact in polynomial_roots(derivative_num):
                if model.domain_issue(a) is None: add(a, 'critical', n, exact)
        for ex in model.exclusions:
            if ex.is_polynomial(Z) and ex != 0:
                for a, _, exact in polynomial_roots(ex):
                    if classify(f, a)[0] == 'regular': add(a, 'removable', 0, exact)
    else:
        note = 'Partial symbolic singularities and unverified numerical zero candidates.'
        if not model.holomorphic_syntax:
            return {'items': [], 'status': 'Nonholomorphic expression', 'method': 'Discrete zero search unavailable for nonholomorphic expressions.', 'complete': False, 'bounds': b}
        branch_points = []
        for arg, cut in model.cuts:
            # Affine log / root arguments have a known finite branch point.
            if isinstance(cut, (int, float)) and arg.is_polynomial(Z) and s.degree(arg, Z) >= 1:
                for a, _, exact in polynomial_roots(arg):
                    add(a, 'branch' if s.degree(arg, Z) == 1 else 'branch-candidate', None, exact)
                    branch_points.append(a)
        try:
            for a in finite_singularities(f, b):
                if a not in branch_points:
                    kind, n = ('unknown', None) if model.cuts else classify(f, a)
                    add(a, kind, n)
        except (NotImplementedError, ValueError):
            pass
        if model.holomorphic_syntax:
            raw_fn = s.lambdify(Z, f, 'mpmath')
            search_limit = 4*max(1, *(abs(v) for v in b.values()))+4
            def fn(z):
                if abs(z) > search_limit: raise ValueError('Root iteration left the search neighbourhood')
                return raw_fn(z)
            with mp.workdps(30):
                for i in range(7):
                    for j in range(7):
                        seed = mp.mpc(b['left']+(b['right']-b['left'])*i/6, b['bottom']+(b['top']-b['bottom'])*j/6)
                        try:
                            r = mp.findroot(fn, (seed+mp.mpc('.001', '.002'), seed+mp.mpc('.002', '.001')), maxsteps=25)
                            if abs(fn(r)) < mp.mpf('1e-18'):
                                a = s.Float(str(r.real), 25)+s.I*s.Float(str(r.imag), 25)
                                if model.domain_issue(a) is None: add(a, 'zero-candidate', None, False)
                        except (ValueError, ZeroDivisionError, OverflowError, TypeError): pass
    return {'items': items, 'status': status, 'method': note, 'complete': bool(rational), 'bounds': b}


def residue(model, data):
    if not model.holomorphic_syntax:
        raise ValueError('Residues require a holomorphic punctured neighbourhood')
    a = point(data['point'])
    if model.cuts:
        raise ValueError('Residues with branch operations are unsupported')
    r = symbolic_residue(model.expr, a)
    kind, order = classify(model.expr, a)
    if kind == 'regular' and any(s.simplify(ex.subs(Z, a)) == 0 for ex in model.exclusions):
        kind = 'removable'
    radius = real_number(data.get('radius', .25), 'Contour radius', 1e-6, 1e6)
    check = integrate(model, {'path': {'type': 'circle', 'center': data['point'], 'radius': radius, 'start': 0, 'end': 360}, 'tolerance': data.get('tolerance', 1e-9)}, compare=False)
    estimate = complex(check['value']['re'], check['value']['im'])/(2j*math.pi)
    expected = pair(r)
    return {'symbolic': str(r), 'latex': s.latex(r), 'numeric': number(r), 'kind': kind, 'order': order,
            'circleEstimate': {'re': estimate.real, 'im': estimate.imag},
            'difference': abs(estimate-complex(expected['re'], expected['im'])) if expected else None,
            'error': check['error']/(2*math.pi), 'converged': check['converged'],
            'method': 'Symbolic residue and numerical contour estimate.'}


def path_segments(path):
    kind = path.get('type')
    if kind in ('circle', 'arc'):
        a = point(path.get('center', {'re': 0, 'im': 0}))
        radius = s.Rational(str(real_number(path.get('radius', 1), 'radius', 1e-6, 1e6)))
        start = s.Rational(str(real_number(path.get('start', 0), 'start angle', -3600, 3600)))*s.pi/180
        end = s.Rational(str(real_number(path.get('end', 360), 'end angle', -3600, 3600)))*s.pi/180
        if start == end: raise ValueError('Start and end angles must differ')
        return [a+radius*s.exp(s.I*(start+(end-start)*T))]
    if kind in ('line', 'polygon'):
        points = path.get('points', [])
        if not 2 <= len(points) <= 32: raise ValueError('A path requires 2–32 vertices')
        ps = [point(p) for p in points]
        if kind == 'polygon' and ps[-1] != ps[0]: ps.append(ps[0])
        if any(a == b for a, b in zip(ps, ps[1:])): raise ValueError('Adjacent vertices must differ')
        return [a+(b-a)*T for a, b in zip(ps, ps[1:])]
    if kind == 'parametric':
        expr = Expression(path['ast']).expr.subs(Z, T)
        t0 = real_number(path.get('t0', 0), 't0', -1e4, 1e4)
        t1 = real_number(path.get('t1', 1), 't1', -1e4, 1e4)
        if t0 == t1: raise ValueError('Parameter interval must be nonzero')
        return [expr.subs(T, t0+(t1-t0)*T)]
    raise ValueError('Unknown path type')


def integrate(model, data, compare=True):
    segments = path_segments(data['path'])
    tol = real_number(data.get('tolerance', 1e-9), 'tolerance', 1e-12, 1e-3)
    f = model.expr
    functions = [(s.lambdify(T, p, 'mpmath'), s.lambdify(T, s.diff(p, T), 'mpmath')) for p in segments]
    fn = s.lambdify(Z, f, 'mpmath')
    exclusion_functions = [s.lambdify(Z, ex, 'mpmath') for ex in model.exclusions]
    cut_functions = [(s.lambdify(Z, arg, 'mpmath'), cut) for arg, cut in model.cuts]
    # Never silently integrate across a sampled pole or branch jump.
    path_points = []
    with mp.workdps(30):
        for p, dp in functions:
            previous = [None]*len(cut_functions)
            for i in range(257):
                z = p(mp.mpf(i)/256)
                try:
                    if any(abs(ex(z)) < mp.mpf('1e-28') for ex in exclusion_functions):
                        raise ValueError(f'Undefined point on path near {z}')
                    value = fn(z)
                    if not mp.isfinite(value): raise ValueError('Singularity on path')
                except (ZeroDivisionError, OverflowError):
                    raise ValueError(f'Singularity on path near {z}')
                for j, (arg, cut) in enumerate(cut_functions):
                    u = arg(z)
                    if isinstance(cut, (int, float)):
                        rotated = u*mp.exp(-1j*mp.radians(cut-180))
                        angle = float(mp.arg(rotated))
                        if abs(u) < mp.mpf('1e-20') or (previous[j] is not None and abs(angle-previous[j]) > math.pi):
                            raise ValueError(f'Branch crossing near {z}')
                        previous[j] = angle
                    elif ((cut in ('asin', 'acos') and abs(u.real) >= 1 and abs(u.imag) < 1e-15) or
                          (cut == 'atan' and abs(u.imag) >= 1 and abs(u.real) < 1e-15)):
                        raise ValueError('Path touches an inverse trigonometric branch cut')
                path_points.append(complex(z))
    # Rational poles can be checked against exact path equations, including poles
    # that fall between numerical samples.
    if f.is_rational_function(Z):
        denominator = s.fraction(s.cancel(f))[1]
        forbidden = polynomial_roots(denominator)
        for ex in model.exclusions:
            if ex.is_polynomial(Z) and ex != 0: forbidden.extend(polynomial_roots(ex))
        for a, _, _ in forbidden:
            for p in segments:
                if p.is_polynomial(T):
                    roots = s.solve(p-a, T)
                    if any(v.is_real and 0 <= v <= 1 for v in roots):
                        raise ValueError(f'Pole or undefined point on path at {a}')
                elif data['path']['type'] in ('circle', 'arc'):
                    c = point(data['path']['center'])
                    radius = float(data['path']['radius'])
                    if abs(abs(complex(s.N(a-c)))-radius) < 1e-12*max(1, radius):
                        angle = math.degrees(cmath.phase(complex(s.N(a-c))))
                        lo, hi = sorted([float(data['path'].get('start', 0)), float(data['path'].get('end', 360))])
                        if any(lo-1e-10 <= angle+360*k <= hi+1e-10 for k in range(-11, 12)):
                            raise ValueError(f'Pole or undefined point on path at {a}')
    def compute(dps, count):
        with mp.workdps(dps):
            total, error, cumulative = mp.mpc(0), mp.mpf(0), []
            for p, dp in functions:
                for i in range(count):
                    part, err = mp.quad(lambda t: fn(p(t))*dp(t), [mp.mpf(i)/count, mp.mpf(i+1)/count], error=True, maxdegree=6)
                    total += part
                    error += abs(err)
                    cumulative.append({'re': float(total.real), 'im': float(total.imag)})
            return total, error, cumulative
    low, e1, _ = compute(25, 4)
    high, e2, cumulative = compute(40, 8)
    error = float(max(abs(high-low), e1, e2))
    if not mp.isfinite(high): raise ValueError('Integral is nonfinite')
    result = {'value': {'re': float(high.real), 'im': float(high.imag)}, 'numeric': mp.nstr(high, 28),
              'error': error, 'converged': error <= tol*(1+float(abs(high))), 'cumulative': cumulative,
              'method': 'Tanh-sinh quadrature; 25/40 digits, 4/8 segments; estimated error.'}
    if compare and f.is_rational_function(Z) and abs(path_points[0]-path_points[-1]) < 1e-9:
        predicted = 0j
        contributions = []
        for a, _, _ in polynomial_roots(s.fraction(s.cancel(f))[1]):
            az = complex(s.N(a))
            winding = sum(cmath.phase((q-az)/(p-az)) for p, q in zip(path_points, path_points[1:]))/(2*math.pi)
            winding = round(winding)
            if winding:
                r = s.residue(f, Z, a)
                predicted += 2j*math.pi*winding*complex(s.N(r))
                contributions.append({'point': str(a), 'residue': str(r), 'winding': winding})
        result['theorem'] = {'value': {'re': predicted.real, 'im': predicted.imag},
                             'difference': abs(complex(high)-predicted), 'contributions': contributions,
                             'note': 'Rational residue theorem with sampled winding numbers.'}
    return result


def series(model, data):
    if not model.holomorphic_syntax:
        raise ValueError('Series require local holomorphy or a holomorphic punctured neighbourhood')
    a = point(data['point'])
    n = real_number(data.get('order', 6), 'order', 1, 16)
    if not n.is_integer(): raise ValueError('Order must be an integer')
    n = int(n)
    radius = real_number(data.get('radius', .5), 'radius', 1e-6, 1e6)
    h = s.Symbol('h')
    f = model.expr
    # A radius selects the requested annulus, not just a display radius.
    rational = f.is_rational_function(Z)
    inner, outer, known, punctured = 0., math.inf, rational, False
    if rational:
        shifted = s.cancel(f.subs(Z, a+h))
        polynomial, remainder = s.div(*s.fraction(shifted), h)
        approx = s.series(polynomial, h, 0, n+1).removeO()
        coeff = {k: s.expand(approx).coeff(h, k) for k in range(-n, n+1)}
        for pole, multiplicity, exact in polynomial_roots(s.fraction(s.cancel(f))[1]):
            if not exact: raise ValueError('Exact poles required for symbolic annular expansion')
            distance = abs(complex(s.N(pole-a)))
            if abs(distance-radius) < 1e-10*max(1, radius):
                raise ValueError('Selected radius passes through a pole')
            if distance < radius:
                inner = max(inner, distance)
                punctured = True
            else: outer = min(outer, distance)
            # Partial fraction coefficients from the regularized principal part.
            regular = s.cancel((Z-pole)**multiplicity*f)
            for j in range(1, multiplicity+1):
                c = s.limit(s.diff(regular, Z, multiplicity-j), Z, pole)/s.factorial(multiplicity-j)
                d = pole-a
                if distance < radius:
                    for k in range(0, max(0, n-j+1)):
                        coeff[-j-k] += c*s.binomial(j+k-1, k)*d**k
                else:
                    for k in range(n+1):
                        coeff[k] += c*(-d)**(-j)*s.binomial(j+k-1, k)/d**k
        approx = s.Add(*(s.simplify(c)*h**k for k, c in coeff.items()))
    else:
        issue = model.domain_issue(a)
        if model.cuts and issue: raise ValueError('Expansion center lies on a branch point or cut')
        reciprocal = s.simplify(f.subs(Z, a+1/h))
        reciprocal_entire = is_entire(reciprocal, h) and not is_entire(f, Z)
        punctured = reciprocal_entire
        expansion = (s.series(reciprocal, h, 0, n+1).removeO().subs(h, 1/h)
                     if reciprocal_entire else s.series(f.subs(Z, a+h), h, 0, n+1))
        approx = s.expand(expansion.removeO())
        terms = approx.as_ordered_terms()
        if any(term.as_powers_dict().get(h, s.S.Zero).is_integer is False for term in terms):
            raise ValueError('Fractional powers require a Puiseux expansion')
        coeff = {int(k): s.simplify(approx.coeff(h, k)) for k in range(-n, n+1)}
        approx = s.Add(*(c*h**k for k, c in coeff.items()))
        known = bool(reciprocal_entire or is_entire(f, Z))
    errors = []
    if inner < radius < outer:
        for i in range(32):
            delta = radius*cmath.exp(2j*math.pi*i/32)
            try:
                actual = complex(s.N(f.subs(Z, a+delta), 24))
                estimated = complex(s.N(approx.subs(h, delta), 24))
                if math.isfinite(abs(actual-estimated)): errors.append(abs(actual-estimated))
            except (TypeError, ValueError, OverflowError): pass
    return {'formula': re.sub(r'\bh\b', '(z-z₀)', str(approx)), 'latex': s.latex(approx),
            'coefficients': [{'power': k, 'exact': str(s.simplify(c)), 'numeric': number(c)} for k, c in sorted(coeff.items()) if c != 0],
            'principal': str(s.Add(*(c*h**k for k, c in coeff.items() if k < 0))),
            'inner': inner, 'outer': outer if math.isfinite(outer) else None, 'radiusKnown': bool(known),
            'punctured': punctured,
            'maxSampleError': max(errors) if errors else None, 'sampleRadius': radius,
            'validSamples': len(errors),
            'method': 'Rational annular or local symbolic series; sampled truncation error.',
            'note': 'Convergence region determined from rational poles.' if rational else 'Infinite radius of convergence.' if known else 'Convergence radius unverified.'}


def branches(model, data):
    a = point(data['point'])
    cuts = []
    for arg, angle in model.cuts:
        record = {'argument': str(arg), 'angle': angle, 'origin': None, 'direction': None}
        if isinstance(angle, (int, float)) and arg.is_polynomial(Z) and s.degree(arg, Z) == 1:
            slope = s.diff(arg, Z)
            origin = -arg.subs(Z, 0)/slope
            direction = s.exp(s.I*s.pi*s.Rational(str(angle))/180)/slope
            record.update(origin=pair(origin), direction=pair(direction))
            # One-sided samples at a point on the ray, away from its endpoint.
            ray_point = origin+direction
            offset = s.I*direction*s.Rational(1, 1000000)
            upper, lower = model.expr.subs(Z, ray_point+offset), model.expr.subs(Z, ray_point-offset)
            record.update(sidePlus=number(upper), sideMinus=number(lower), jump=number(upper-lower))
        cuts.append(record)
    return {'value': number(model.expr.subs(Z, a)), 'cuts': cuts, 'issue': model.domain_issue(a),
            'range': f'({model.cut-360}°, {model.cut}°] + 360° × {model.branch}',
            'method': 'Selected log/root/power branch; inverse trigonometric principal branches; affine cut rays.'}


def dispatch(data):
    actions = {'local': local, 'landmarks': landmarks, 'residue': residue, 'integral': integrate, 'series': series, 'branches': branches}
    action = data.get('action')
    if action not in actions: raise ValueError('Unknown analysis action')
    model = Expression(data['ast'], data.get('options'))
    result = actions[action](model, data)
    return {'ok': True, 'result': result}
