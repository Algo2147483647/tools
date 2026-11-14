"""Preserve domain restrictions from syntax BEFORE simplification."""
import sympy as sp
from .ir import lower
from .common import ToolError


def analyze(ir, domain='real'):
    constraints=[];complete=True
    def add(condition):
        condition=sp.simplify(condition)
        if condition is sp.S.false:raise ToolError('DOMAIN_ERROR','Expression is undefined on the declared domain.')
        if condition is not sp.S.true and condition not in constraints:constraints.append(condition)
    def walk(n):
        nonlocal complete
        kind=n['kind']
        for child in n.get('args',[]):walk(child)
        for row in n.get('rows',[]):
            for child in row:walk(child)
        if kind=='Divide':add(sp.Ne(lower(n['args'][1],domain),0))
        elif kind=='Power':
            a,b=[lower(v,domain) for v in n['args']];b=sp.simplify(b)
            if b.is_integer:
                if b.is_nonpositive:add(sp.Ne(a,0))
                elif b.is_positive is not True:complete=False
            elif b.is_Rational:
                if domain=='real':add(sp.Ge(a,0) if b>0 else sp.Gt(a,0))
                elif b<0:add(sp.Ne(a,0))
            else:complete=False
        elif kind=='Function':
            name=n['name'];a=lower(n['args'][0],domain)
            if name=='sqrt' and domain=='real':add(sp.Ge(a,0))
            elif name=='log':add(sp.Gt(a,0) if domain=='real' else sp.Ne(a,0))
            elif name in ('asin','acos') and domain=='real':add(sp.Ge(a,-1));add(sp.Le(a,1))
            elif name=='tan':add(sp.Ne(sp.cos(a),0))
            elif domain=='complex':complete=False
    walk(ir)
    return constraints, dict(declared=domain,conditions=[str(c) for c in constraints],
                            exclusions=[str(c.rhs if c.lhs==0 else c.lhs)+' != 0' for c in constraints if isinstance(c,sp.Unequality)],
                            analysisComplete=complete)


def filter_solutions(solution, constraints, variable, domain):
    if not constraints:return solution
    if isinstance(solution,sp.FiniteSet):
        accepted=[];pending=[]
        for candidate in solution:
            condition=sp.simplify(sp.And(*[c.subs(variable,candidate) for c in constraints]))
            if condition is sp.S.true:accepted.append(candidate)
            elif condition is not sp.S.false:pending.append(candidate)
        known=sp.FiniteSet(*accepted)
        return sp.Union(known,sp.ConditionSet(variable,sp.And(*constraints),sp.FiniteSet(*pending))) if pending else known
    if domain=='real':
        try:
            allowed=sp.reduce_inequalities(constraints,variable).as_set()
            return solution.intersect(allowed)
        except (NotImplementedError,ValueError,TypeError):pass
    return sp.ConditionSet(variable,sp.And(*constraints),solution)
