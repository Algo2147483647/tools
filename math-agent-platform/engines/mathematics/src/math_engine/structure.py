import sympy as sp
from .ir import parse,validate_ir,lower,encode
from .domains import analyze
from .common import ToolError,value_result,math_view


def structure(args):
    if ('expression' in args)==('ir' in args):raise ToolError('INVALID_ARGUMENT','Supply exactly one of expression or ir.')
    tree=args.get('ir') if 'ir' in args else parse(args['expression'],args.get('format','ascii'))
    validate_ir(tree)
    domain=args.get('domain','real');_,conditions=analyze(tree,domain);value=lower(tree,domain)
    return value_result(dict(kind='parsed_expression',ir=tree,irVersion=1,expression=str(value),latex=sp.latex(value),
                             domain=conditions,representation='exact'),[math_view(value,'Parsed expression')],
                        notes=['Parsing preserves syntax; the rendered preview may simplify constants.'])
