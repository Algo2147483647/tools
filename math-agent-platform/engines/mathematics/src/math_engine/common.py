"""One bounded mathematical request per process. No eval, exec or user code."""
import ast, base64, io, json, math, os, re, sys, time, warnings

class ToolError(Exception):
    def __init__(self, code, message): self.code, self.message = code, message; super().__init__(message)

import sympy as sp
import numpy as np

FUNCTIONS={'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'asin':sp.asin,'acos':sp.acos,'atan':sp.atan,'sinh':sp.sinh,'cosh':sp.cosh,'tanh':sp.tanh,'exp':sp.exp,'log':sp.log,'sqrt':sp.sqrt,'abs':sp.Abs}
NUMERIC={sp.sin:np.sin,sp.cos:np.cos,sp.tan:np.tan,sp.asin:np.arcsin,sp.acos:np.arccos,sp.atan:np.arctan,sp.sinh:np.sinh,sp.cosh:np.cosh,sp.tanh:np.tanh,sp.exp:np.exp,sp.log:np.log,sp.Abs:np.abs}

def expression(text, domain='real'):
    if not isinstance(text,str) or not text.strip() or len(text)>4096: raise ToolError('INVALID_ARGUMENT','Expression must have 1–4096 characters.')
    text=text.replace('^','**')
    try: tree=ast.parse(text,mode='eval')
    except SyntaxError: raise ToolError('INVALID_ARGUMENT','Use explicit multiplication and ASCII math syntax.')
    if sum(1 for _ in ast.walk(tree))>256: raise ToolError('RESOURCE_LIMIT','Expression is too complex.')
    def convert(node,depth=0):
        if depth>48: raise ToolError('RESOURCE_LIMIT','Expression nesting is too deep.')
        child=lambda x:convert(x,depth+1)
        if isinstance(node,ast.Constant) and type(node.value) in (int,float):
            literal=ast.get_source_segment(text,node)
            if len(literal)>64 or not math.isfinite(float(node.value)): raise ToolError('INVALID_ARGUMENT','Numeric literal is too large.')
            return sp.Rational(literal)
        if isinstance(node,ast.Name):
            if node.id in ('pi','E'): return {'pi':sp.pi,'E':sp.E}[node.id]
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,23}',node.id): raise ToolError('INVALID_ARGUMENT','Invalid symbol name.')
            return sp.Symbol(node.id,real=True) if domain=='real' else sp.Symbol(node.id)
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.USub,ast.UAdd)): return -child(node.operand) if isinstance(node.op,ast.USub) else child(node.operand)
        if isinstance(node,ast.BinOp):
            a,b=child(node.left),child(node.right)
            if isinstance(node.op,ast.Add): return sp.Add(a,b,evaluate=False)
            if isinstance(node.op,ast.Sub): return sp.Add(a,-b,evaluate=False)
            if isinstance(node.op,ast.Mult): return sp.Mul(a,b,evaluate=False)
            if isinstance(node.op,ast.Div): return sp.Mul(a,sp.Pow(b,-1,evaluate=False),evaluate=False)
            if isinstance(node.op,ast.Pow):
                if b.is_number and (not b.is_real or abs(b)>1000): raise ToolError('RESOURCE_LIMIT','Exponent is outside the supported budget.')
                return sp.Pow(a,b,evaluate=False)
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in FUNCTIONS and len(node.args)==1 and not node.keywords:
            return FUNCTIONS[node.func.id](child(node.args[0]))
        raise ToolError('INVALID_ARGUMENT','Unsupported expression syntax; only mathematical operators and allowlisted functions are accepted.')
    return convert(tree.body)

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

