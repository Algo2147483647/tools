"""Bounded, lossless mathematical syntax; no eval or backend string parsing."""
import re
from fractions import Fraction
import sympy as sp
from .common import ToolError, FUNCTIONS

OPS = {'+':'Add','-':'Subtract','*':'Multiply','/':'Divide','^':'Power','=':'Equation'}


def node(kind, **fields): return dict(kind=kind, **fields)


def literal(text):
    if len(text) > 256: raise ToolError('RESOURCE_LIMIT','Numeric literal is too long.')
    match = re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?',text)
    if not match: raise ToolError('INVALID_ARGUMENT','Invalid numeric literal.')
    if match[1] and (len(match[1].lstrip('+-')) > 4 or abs(int(match[1])) > 1000):
        raise ToolError('RESOURCE_LIMIT','Decimal exponent exceeds 1000.')
    return node('DecimalLiteral' if any(c in text for c in '.eE') else 'Integer',value=text)


class Parser:
    def __init__(self, source, latex=False, implicit=False):
        if not isinstance(source,str) or not source.strip() or len(source)>4096:
            raise ToolError('INVALID_ARGUMENT','Expression must have 1–4096 characters.')
        self.source=source; self.latex=latex; self.implicit=implicit or latex
        pattern = r'\s+|\\[A-Za-z]+|\\\\|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|\*\*|[+*/^=(){}\[\]&_-]'
        if latex:pattern=pattern.replace('[A-Za-z][A-Za-z0-9_]*','[A-Za-z]+')
        self.tokens=[]; offset=0
        while offset<len(source):
            m=re.match(pattern,source[offset:])
            if not m: self.fail('Unsupported character',offset)
            token=m[0]
            if not token.isspace():
                if latex and re.fullmatch('[A-Za-z][A-Za-z0-9_]*',token):
                    # Plain letters are single-letter variables in this LaTeX subset.
                    if not token.isalpha(): self.fail('Use braced subscripts',offset)
                    self.tokens.extend((c,offset+i) for i,c in enumerate(token))
                else:self.tokens.append((token,offset))
            offset+=len(token)
        if len(self.tokens)>512: raise ToolError('RESOURCE_LIMIT','Too many tokens.')
        self.pos=0

    def fail(self,message,offset=None):
        if offset is None: offset=self.tokens[self.pos][1] if self.pos<len(self.tokens) else len(self.source)
        raise ToolError('INVALID_ARGUMENT',f'{message} at offset {offset}.')

    def peek(self):return self.tokens[self.pos][0] if self.pos<len(self.tokens) else None
    def take(self,expected=None):
        token=self.peek()
        if token is None or expected is not None and token!=expected:self.fail('Expected '+str(expected))
        self.pos+=1;return token

    def group(self,depth,left='{',right='}'):
        self.take(left); value=self.expr(depth+1);self.take(right);return value

    def atom(self,depth):
        if depth>48: raise ToolError('RESOURCE_LIMIT','Expression nesting is too deep.')
        token=self.peek()
        if token in ('(', '{'): return self.group(depth,token,')' if token=='(' else '}')
        if token == r'\frac':
            self.take();return node('Divide',args=[self.group(depth),self.group(depth)])
        if token == r'\sqrt':
            self.take()
            if self.peek()=='[':self.fail('Indexed roots are not in the LaTeX subset')
            return node('Function',name='sqrt',args=[self.group(depth)])
        if token == r'\begin':
            self.take();self.take('{');name=''
            while self.peek() not in (None,'}'): name+=self.take()
            self.take('}')
            if name not in ('matrix','pmatrix','bmatrix'):self.fail('Unsupported environment')
            rows=[[]]
            while True:
                rows[-1].append(self.expr(depth+1))
                if self.peek()=='&':self.take();continue
                if self.peek()==r'\\':self.take();rows.append([]);continue
                break
            self.take(r'\end');self.take('{');end=''
            while self.peek() not in (None,'}'):end+=self.take()
            self.take('}')
            if end!=name or not rows[0] or any(len(r)!=len(rows[0]) for r in rows):self.fail('Invalid matrix shape or environment')
            if len(rows)*len(rows[0])>100:raise ToolError('RESOURCE_LIMIT','LaTeX matrix exceeds 100 entries.')
            return node('Matrix',rows=rows)
        if token and token.startswith('\\'):
            self.take();name=token[1:]
            if name=='pi':return node('Constant',name='pi')
            if name not in FUNCTIONS:self.fail('Unsupported LaTeX command '+token)
            if self.peek() not in ('{','('):self.fail('Function arguments require braces or parentheses')
            return node('Function',name=name,args=[self.atom(depth+1)])
        if token and re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?',token):
            self.take();return literal(token)
        if token and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,23}',token):
            self.take()
            if not self.latex and token in FUNCTIONS and self.peek()=='(':
                return node('Function',name=token,args=[self.group(depth,'(',')')])
            if self.latex and self.peek()=='_':
                self.take();self.take('{');sub=''
                while self.peek() not in (None,'}'):sub+=self.take()
                self.take('}')
                if not re.fullmatch('[A-Za-z0-9]+',sub):self.fail('Invalid subscript')
                token+='_'+sub
            return node('Constant',name=token) if not self.latex and token in ('pi','E') else node('Symbol',name=token)
        self.fail('Expected mathematical expression')

    def unary(self,depth):
        if depth>48:raise ToolError('RESOURCE_LIMIT','Expression nesting is too deep.')
        if self.peek() in ('+','-'):
            op=self.take();return node('Unary',operator=op,args=[self.unary(depth+1)])
        value=self.atom(depth+1)
        if self.peek() in ('^','**'):
            self.take();value=node('Power',args=[value,self.unary(depth+1)])
        return value

    def term(self,depth):
        value=self.unary(depth+1)
        while True:
            token=self.peek()
            if token in ('*','/',r'\cdot',r'\times'):
                self.take();op='Divide' if token=='/' else 'Multiply'
            elif self.implicit and token and (token in ('(',r'\frac',r'\sqrt',r'\pi') or re.fullmatch('[A-Za-z][A-Za-z0-9_]*',token)):
                op='Multiply'
            else:break
            value=node(op,args=[value,self.unary(depth+1)])
        return value

    def expr(self,depth=0):
        value=self.term(depth+1)
        while self.peek() in ('+','-'):
            op=self.take();value=node(OPS[op],args=[value,self.term(depth+1)])
        return value

    def parse(self):
        value=self.expr()
        if self.peek()=='=':self.take();value=node('Equation',args=[value,self.expr()])
        if self.peek() is not None:self.fail('Unexpected token '+self.peek())
        validate_ir(value)
        return value


def parse(source, format='ascii', implicit=False):
    if format not in ('ascii','latex'):raise ToolError('INVALID_ARGUMENT','Unknown input format.')
    source=source.strip() if isinstance(source,str) else source
    if isinstance(source,str):
        for left,right in [('$$','$$'),(r'\[',r'\]'),(r'\(',r'\)'),('$','$')]:
            if source.startswith(left) and source.endswith(right):source=source[len(left):-len(right)].strip();break
        source=source.replace('−','-').replace('×','*').replace('÷','/')
    return Parser(source,format=='latex',implicit).parse()


def input_tree(args, text_key='expression', ir_key='ir', implicit=False):
    if (text_key in args)==(ir_key in args):raise ToolError('INVALID_ARGUMENT','Supply exactly one of '+text_key+' or '+ir_key+'.')
    if ir_key in args:
        validate_ir(args[ir_key]);return args[ir_key]
    return parse(args[text_key],args.get('format','ascii'),implicit)


def validate_ir(value):
    # Count all containers first, including nested sets, with a shared budget.
    total=0
    def size(v,depth=0):
        nonlocal total
        if depth>100:raise ToolError('RESOURCE_LIMIT','MathIR nesting exceeds budget.')
        if isinstance(v,dict):
            total+=1
            if total>512:raise ToolError('RESOURCE_LIMIT','MathIR exceeds budget.')
            for child in v.values():size(child,depth+1)
        elif isinstance(v,list):
            if len(v)>512:raise ToolError('RESOURCE_LIMIT','MathIR collection exceeds budget.')
            for child in v:size(child,depth+1)
    size(value)
    count=0
    def visit(n,depth=0):
        nonlocal count
        count+=1
        if count>512 or depth>48:raise ToolError('RESOURCE_LIMIT','MathIR exceeds budget.')
        if not isinstance(n,dict):raise ToolError('INVALID_ARGUMENT','MathIR node must be an object.')
        kind=n.get('kind'); keys={'kind'};children=[]
        if kind in ('Integer','DecimalLiteral'):
            keys.add('value');v=n.get('value')
            if not isinstance(v,str):raise ToolError('INVALID_ARGUMENT','Numbers must be strings.')
            if kind=='Integer':
                if not re.fullmatch(r'-?\d{1,1234}',v):raise ToolError('INVALID_ARGUMENT','Invalid integer.')
            else:literal(v)
        elif kind=='Rational':
            keys.update(('numerator','denominator'))
            for field in ('numerator','denominator'):
                if not isinstance(n.get(field),str) or not re.fullmatch(r'-?\d{1,1234}',n[field]):raise ToolError('INVALID_ARGUMENT','Invalid rational.')
            if int(n['denominator'])<=0:raise ToolError('INVALID_ARGUMENT','Denominator must be positive.')
        elif kind=='Restricted':
            keys.update(('expression','source'));children=[n.get('expression'),n.get('source')]
        elif kind=='Conditioned':
            keys.update(('expression','conditions'))
            if not isinstance(n.get('conditions'),list) or not 1<=len(n['conditions'])<=16:raise ToolError('INVALID_ARGUMENT','Conditioned expressions require 1–16 conditions.')
            children=[n.get('expression')]+n['conditions']
        elif kind=='Relation':
            keys.update(('relation','args'));children=n.get('args')
            if n.get('relation') not in ('!=','<','<=','>','>=') or not isinstance(children,list) or len(children)!=2:raise ToolError('INVALID_ARGUMENT','Invalid relation node.')
        elif kind=='Algebraic':
            keys.update(('polynomial','realRootIndex'));coeff=n.get('polynomial');index=n.get('realRootIndex')
            if not isinstance(coeff,list) or not 2<=len(coeff)<=17 or any(not isinstance(c,str) or not re.fullmatch(r'-?\d{1,256}',c) for c in coeff):raise ToolError('INVALID_ARGUMENT','Invalid minimal polynomial coefficients.')
            if int(coeff[0])<=0 or type(index) is not int or not 0<=index<len(coeff)-1:raise ToolError('INVALID_ARGUMENT','Invalid algebraic root selector.')
        elif kind in ('EmptySet','Universe','FiniteSet','Interval','Union','Intersection','Complement'):
            from .sets import decode_set
            decode_set(n)
            return
        elif kind in ('Symbol','Constant'):
            keys.add('name');name=n.get('name')
            if not isinstance(name,str) or not re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,23}',name):raise ToolError('INVALID_ARGUMENT','Invalid symbol.')
            if kind=='Constant' and name not in ('pi','E'):raise ToolError('UNSUPPORTED','Unknown constant.')
        elif kind in set(OPS.values())|{'Unary','Function'}:
            keys.add('args');children=n.get('args')
            if not isinstance(children,list) or len(children)!=(1 if kind in ('Unary','Function') else 2):raise ToolError('INVALID_ARGUMENT','Invalid arity.')
            if kind=='Unary':
                keys.add('operator')
                if n.get('operator') not in ('+','-'):raise ToolError('INVALID_ARGUMENT','Invalid unary operator.')
            if kind=='Function':
                keys.add('name')
                if n.get('name') not in FUNCTIONS:raise ToolError('UNSUPPORTED','Unknown function.')
        elif kind=='Matrix':
            keys.add('rows');rows=n.get('rows')
            if not isinstance(rows,list) or not rows or not isinstance(rows[0],list) or not rows[0] or any(not isinstance(r,list) or len(r)!=len(rows[0]) for r in rows):raise ToolError('INVALID_ARGUMENT','Invalid matrix shape.')
            if len(rows)*len(rows[0])>144:raise ToolError('RESOURCE_LIMIT','Structured matrix exceeds 144 entries.')
            children=[v for r in rows for v in r]
        else:raise ToolError('UNSUPPORTED','Unsupported MathIR kind: '+str(kind))
        if set(n)!=keys:raise ToolError('INVALID_ARGUMENT','Unexpected or missing MathIR fields.')
        for child in children:visit(child,depth+1)
    visit(value)


def lower(ir,domain='real'):
    """Lower a validated MathIR tree to SymPy without evaluating source code."""
    kind=ir['kind']
    if kind in ('Restricted','Conditioned'):return lower(ir['expression'],domain)
    if kind in ('Integer','DecimalLiteral'):return sp.Rational(ir['value'])
    if kind=='Rational':return sp.Rational(ir['numerator'],ir['denominator'])
    if kind=='Constant':return {'pi':sp.pi,'E':sp.E}[ir['name']]
    if kind=='Symbol':return sp.Symbol(ir['name'],real=True) if domain=='real' else sp.Symbol(ir['name'])
    if kind=='Algebraic':
        z=sp.Symbol('z');p=sp.Poly.from_list([sp.Integer(c) for c in ir['polynomial']],z,domain='ZZ')
        if not p.is_irreducible:raise ToolError('INVALID_ARGUMENT','Algebraic polynomial must be irreducible over QQ.')
        roots=sp.polys.polytools.real_roots(p,radicals=False)
        if ir['realRootIndex']>=len(roots):raise ToolError('INVALID_ARGUMENT','Real root index is out of range.')
        return roots[ir['realRootIndex']]
    if kind in ('EmptySet','Universe','FiniteSet','Interval','Union','Intersection','Complement'):
        from .sets import decode_set
        return decode_set(ir)
    if kind=='Matrix':return sp.ImmutableMatrix([[lower(v,domain) for v in r] for r in ir['rows']])
    args=[lower(v,domain) for v in ir['args']]
    if any(isinstance(v,sp.MatrixBase) or isinstance(v,sp.Equality) for v in args):raise ToolError('UNSUPPORTED','Nested matrix/equation arithmetic is not supported.')
    if kind=='Unary':return args[0] if ir['operator']=='+' else -args[0]
    if kind=='Function':return FUNCTIONS[ir['name']](args[0])
    a,b=args
    if kind=='Relation':return {'!=':sp.Ne,'<':sp.Lt,'<=':sp.Le,'>':sp.Gt,'>=':sp.Ge}[ir['relation']](a,b,evaluate=False)
    if kind=='Add':return sp.Add(a,b,evaluate=False)
    if kind=='Subtract':return sp.Add(a,-b,evaluate=False)
    if kind=='Multiply':return sp.Mul(a,b,evaluate=False)
    if kind=='Divide':return sp.Mul(a,sp.Pow(b,-1,evaluate=False),evaluate=False)
    if kind=='Equation':return sp.Eq(a,b,evaluate=False)
    if b.is_number and (b.is_real is not True or abs(b)>4096):raise ToolError('RESOURCE_LIMIT','Exponent exceeds budget.')
    return sp.Pow(a,b,evaluate=False)


def encode(expr):
    """Exact backend-independent result tree; unsupported objects are explicit."""
    if isinstance(expr,sp.Set):
        from .sets import encode_set
        return encode_set(expr)
    if isinstance(expr,sp.CRootOf):
        from .algebra import algebraic_descriptor
        return algebraic_descriptor(expr)[0]
    if isinstance(expr,sp.Integer):return node('Integer',value=str(expr))
    if isinstance(expr,sp.Rational):return node('Rational',numerator=str(expr.p),denominator=str(expr.q))
    if isinstance(expr,sp.Symbol):return node('Symbol',name=str(expr))
    if expr in (sp.pi,sp.E):return node('Constant',name=str(expr))
    if isinstance(expr,sp.MatrixBase):return node('Matrix',rows=[[encode(v) for v in row] for row in expr.tolist()])
    if isinstance(expr,(sp.Add,sp.Mul)):
        kind='Add' if isinstance(expr,sp.Add) else 'Multiply'
        items=list(expr.args);result=encode(items[0])
        for item in items[1:]:result=node(kind,args=[result,encode(item)])
        return result
    if isinstance(expr,sp.Pow):return node('Power',args=[encode(v) for v in expr.args])
    for name,fn in FUNCTIONS.items():
        if expr.func==fn:return node('Function',name=name,args=[encode(v) for v in expr.args])
    raise ToolError('UNSUPPORTED','Result has no supported MathIR representation: '+str(expr.func))
