from pathlib import Path
src=Path('math-agent-platform/engines/mathematics/src/math_engine')
p=src/'common.py';s=p.read_text(encoding='utf-8');start=s.index('def expression(');end=s.index('\ndef symbol(',start);s=s[:start]+'''def expression(text, domain='real'):
    from .ir import parse, lower
    from .domains import analyze
    tree=parse(text)
    if tree['kind'] in ('Equation','Matrix'):raise ToolError('INVALID_ARGUMENT','A scalar expression is required.')
    analyze(tree,domain)
    return lower(tree,domain)

'''+s[end:];p.write_text(s,encoding='utf-8')
p=src/'exact.py';s=p.read_text(encoding='utf-8');start=s.index('def parse(');end=s.index('\ndef exponent(',start)
s=s[:start]+'''def parse(source, format='ascii'):
    from .ir import parse as parse_ir
    tree=parse_ir(source,format,implicit=True)
    variables=set()
    def convert(n):
        kind=n['kind']
        if kind in ('Integer','DecimalLiteral'):return ('number',n['value'])
        if kind=='Rational':return ('number',n['numerator']+'/'+n['denominator'])
        if kind=='Symbol':
            if len(n['name'])!=1:raise ToolError('UNSUPPORTED','Affine variables must be single letters.')
            variables.add(n['name']);return ('variable',n['name'])
        if kind=='Unary':return ('unary',n['operator'],convert(n['args'][0]))
        ops={'Add':'+','Subtract':'-','Multiply':'*','Divide':'/','Power':'^'}
        if kind in ops:return ('binary',ops[kind],*[convert(v) for v in n['args']])
        raise ToolError('UNSUPPORTED','Exact affine arithmetic does not support '+kind+'.')
    left,right=(convert(tree['args'][0]),convert(tree['args'][1])) if tree['kind']=='Equation' else (convert(tree),None)
    if len(variables)>1:raise ToolError('UNSUPPORTED','Only one affine variable is supported.')
    if variables and right is None:raise ToolError('NEEDS_INPUT','Variable expressions require an equation.')
    return source,next(iter(variables),None),left,right

'''+s[end:]
s=s.replace("def exact(args):\n    text, variable, left, right = parse(args['expression'])", "def exact(args):\n    if args.get('operation','evaluate') != 'evaluate':return arithmetic(args)\n    if any(k in args for k in ('other','digits','rounding')):raise ToolError('INVALID_ARGUMENT','Unused arithmetic arguments.')\n    text, variable, left, right = parse(args['expression'],args.get('format','ascii'))")
s=s.replace("    if not passed: raise ToolError('VERIFICATION_FAILED', 'Exact verification failed.')", "    from .ir import parse as parse_ir\n    result['inputIR']=parse_ir(args['expression'],args.get('format','ascii'),implicit=True)\n    result['irVersion']=1\n    if not passed: raise ToolError('VERIFICATION_FAILED', 'Exact verification failed.')")
s+='''

def arithmetic(args):
    op=args['operation']
    if op not in ('floor','ceil','truncate','mod','compare','round'):raise ToolError('UNSUPPORTED','Unknown exact operation.')
    if ('other' in args)!=(op in ('mod','compare')):raise ToolError('INVALID_ARGUMENT','other is required only for mod and compare.')
    if op!='round' and any(k in args for k in ('digits','rounding')):raise ToolError('INVALID_ARGUMENT','Rounding fields apply only to round.')
    def rational(text):
        _,variable,left,right=parse(text,args.get('format','ascii'))
        if variable or right is not None:raise ToolError('INVALID_ARGUMENT','A rational constant is required.')
        v,dependent=evaluate(left,Fraction(0))
        return bounded(v)
    a=rational(args['expression']);b=rational(args['other']) if 'other' in args else None
    if op=='floor':value=Fraction(a.numerator//a.denominator)
    elif op=='ceil':value=Fraction(-((-a.numerator)//a.denominator))
    elif op=='truncate':value=Fraction(int(a))
    elif op=='compare':value=Fraction((a>b)-(a<b))
    elif op=='mod':
        if b==0:raise ToolError('DOMAIN_ERROR','Modulo by zero.')
        value=a-b*(a//b)
    else:
        digits=args.get('digits',0);mode=args.get('rounding','half_even');scale=Fraction(10)**digits;t=a*scale
        sign=-1 if t<0 else 1; t=abs(t);q,r=divmod(t.numerator,t.denominator)
        if 2*r>t.denominator or 2*r==t.denominator and (mode=='half_away_from_zero' or q%2):q+=1
        value=Fraction(sign*q)/scale
    value=bounded(value)
    from .ir import encode,parse as parse_ir
    import sympy as sp
    result=dict(kind='scalar',value=str(value),exact=True,representation='exact',ir=encode(sp.Rational(value.numerator,value.denominator)),
                inputIR=parse_ir(args['expression'],args.get('format','ascii'),implicit=True),irVersion=1)
    return value_result(result,diagnostics={'operation':op,'modConvention':'a-b*floor(a/b)' if op=='mod' else None,
                        'rounding':args.get('rounding','half_even') if op=='round' else None},
                        assumptions=['Exact rational arithmetic; comparison returns -1, 0 or 1.'])
''';p.write_text(s,encoding='utf-8')
p=src/'symbolic.py';s=p.read_text(encoding='utf-8');start=s.index("    source=args['expression']");end=s.index("    assumptions=",start)
s=s[:start]+'''    from .ir import parse,lower,encode
    from .domains import analyze,filter_solutions
    tree=parse(args['expression'],args.get('format','ascii'))
    constraints,domain_info=analyze(tree,domain)
    parsed=lower(tree,domain)
    if tree['kind']=='Matrix':raise ToolError('UNSUPPORTED','Use structure_math to parse matrices.')
    if tree['kind']=='Equation' and op!='solve':raise ToolError('INVALID_ARGUMENT','Equations require solve.')
    expr=parsed.lhs-parsed.rhs if tree['kind']=='Equation' else parsed
    checks=[];notes=[]
'''+s[end:]
s=s.replace("        if isinstance(result,sp.FiniteSet):", "        result=filter_solutions(result,constraints,x,domain)\n        if isinstance(result,sp.FiniteSet):")
s=s.replace("'variable':str(x),'domain':domain}","'variable':str(x),'domain':domain_info,'inputIR':tree,'irVersion':1}")
s=s.replace("    return value_result({'kind':'expression'", "    try: result_ir=encode(result)\n    except ToolError: result_ir=None\n    return value_result({'inputIR':tree,'ir':result_ir,'irVersion':1,'domain':domain_info,'kind':'expression'")
s=s.replace("assumptions=['Symbols are '+domain+'.']","assumptions=['Symbols are '+domain+'.']+domain_info['conditions']")
p.write_text(s,encoding='utf-8')
p=src/'results.py';s=p.read_text(encoding='utf-8').replace("result['representation'] =", "result.setdefault('representation',").replace("else 'approximate'\n", "else 'approximate')\n")
s=s.replace("result['domain'] = dict(","result.setdefault('domain', dict(").replace("analysisComplete=tool == 'exact_math')", "analysisComplete=tool == 'exact_math'))")
s=s.replace("if tool == 'exact_math': result['completeness'] = 'complete'", "if tool == 'exact_math' and arguments.get('operation','evaluate')=='evaluate': result['completeness'] = 'complete'")
p.write_text(s,encoding='utf-8')
