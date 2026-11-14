"""One bounded mathematical request per process. No eval, exec or user code."""
import ast, base64, io, json, math, os, re, sys, time, warnings

class ToolError(Exception):
    def __init__(self, code, message): self.code, self.message = code, message; super().__init__(message)

import sympy as sp
import numpy as np

FUNCTIONS={'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'asin':sp.asin,'acos':sp.acos,'atan':sp.atan,'sinh':sp.sinh,'cosh':sp.cosh,'tanh':sp.tanh,'exp':sp.exp,'log':sp.log,'sqrt':sp.sqrt,'abs':sp.Abs}
NUMERIC={sp.sin:np.sin,sp.cos:np.cos,sp.tan:np.tan,sp.asin:np.arcsin,sp.acos:np.arccos,sp.atan:np.arctan,sp.sinh:np.sinh,sp.cosh:np.cosh,sp.tanh:np.tanh,sp.exp:np.exp,sp.log:np.log,sp.Abs:np.abs}

def expression(text, domain='real'):
    from .ir import parse, lower
    from .domains import analyze
    tree=parse(text)
    if tree['kind'] in ('Equation','Matrix'):raise ToolError('INVALID_ARGUMENT','A scalar expression is required.')
    analyze(tree,domain)
    return lower(tree,domain)


def symbol(name,domain='real'):
    if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,23}',name) or name in ('pi','E'): raise ToolError('INVALID_ARGUMENT','Invalid variable.')
    return sp.Symbol(name,real=True) if domain=='real' else sp.Symbol(name)

def number(value):
    if isinstance(value,bool): raise ToolError('INVALID_ARGUMENT','Expected a finite number.')
    try: result=float(value)
    except (ValueError,TypeError): raise ToolError('INVALID_ARGUMENT','Expected a finite number.')
    if not math.isfinite(result): raise ToolError('INVALID_ARGUMENT','Expected a finite number.')
    return result

def interval(args,key='interval'):
    bounds=args.get(key)
    if not isinstance(bounds,list) or len(bounds)!=2: raise ToolError('INVALID_ARGUMENT','Supply two interval endpoints.')
    a,b=map(number,bounds)
    if not a<b: raise ToolError('INVALID_ARGUMENT','Interval endpoints must be increasing.')
    return a,b

def exact_interval(args):
    bounds = args.get('interval')
    if not isinstance(bounds, list) or len(bounds) != 2:
        raise ToolError('INVALID_ARGUMENT', 'Supply two exact interval endpoints.')
    values = []
    for bound in bounds:
        if isinstance(bound, bool) or not isinstance(bound, (str, int, float)):
            raise ToolError('INVALID_ARGUMENT', 'Invalid exact endpoint.')
        value = expression(str(bound))
        if value.free_symbols or value.is_real is not True or value.is_finite is not True:
            raise ToolError('DOMAIN_ERROR', 'Endpoints must be finite real constants.')
        values.append(value)
    if (values[0] < values[1]) is not sp.S.true:
        raise ToolError('INVALID_ARGUMENT', 'Endpoints must be provably increasing.')
    return values


def numeric_function(expr,x):
    if expr.free_symbols-{x}: raise ToolError('INVALID_ARGUMENT','Supply values for all symbols other than '+str(x)+'.')
    def evaluate(node,value):
        if node==x:return value
        if not node.free_symbols:return float(node.evalf())
        children=[evaluate(a,value) for a in node.args]
        if isinstance(node,sp.Add):return sum(children)
        if isinstance(node,sp.Mul):
            v=1
            for c in children:v=v*c
            return v
        if isinstance(node,sp.Pow):return np.power(children[0],children[1])
        if node.func in NUMERIC:return NUMERIC[node.func](*children)
        raise ToolError('UNSUPPORTED','Numeric evaluation does not support this expression.')
    def call(value):
        with np.errstate(all='ignore'):return evaluate(expr,value)
    return call

def checked(status='not_checked',scope='Computed result; not a proof of the original question.',checks=None):return {'status':status,'scope':scope,'checks':checks or []}
def value_result(result,views=None,diagnostics=None,verification=None,assumptions=None,notes=None):
    return {'result':result,'views':views or [],'diagnostics':diagnostics or {},'verification':verification or checked(),'assumptions':assumptions or [],'warnings':notes or []}
def math_view(value,title='Result'):return {'kind':'math','title':title,'latex':sp.latex(value)}
def table_view(columns,rows,title='Analysis',total=None):return {'kind':'table','title':title,'columns':list(columns),'rows':rows[:200],'totalRows':total if total is not None else len(rows)}

