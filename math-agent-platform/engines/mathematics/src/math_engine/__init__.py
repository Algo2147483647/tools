"""Public API. No Electron, credentials, network or process policy is needed to import."""
__version__ = '0.9.0'


def catalogue():
    from copy import deepcopy
    from .protocol import CATALOGUE
    return deepcopy(CATALOGUE)


def _execute(request):
    from .protocol import validate_request, validate, VALUE_SCHEMA
    from .common import ToolError
    try:
        validate_request(request)
        name, args = request['tool'], request['arguments']
        if name == 'exact_math':
            from .exact import exact
            output = exact(args)
        elif name == 'convex_optimize':
            from .convex import optimize
            output = optimize(args)
        elif name == 'symbolic_math':
            from .symbolic import symbolic
            output = symbolic(args)
        elif name == 'numeric_math':
            from .numerical import numeric
            output = numeric(args)
        elif name == 'plot_math':
            from .plotting import plot
            output = plot(args, request.get('dataset'))
        else:
            from .statistics import analysis
            output = analysis(args, request.get('dataset'))
        output['diagnostics'].update(engine='math-agent-engine', version=__version__)
        validate(output, VALUE_SCHEMA)
        return {'schemaVersion': 1, 'ok': True, 'value': output}
    except ToolError as error:
        return {'schemaVersion': 1, 'ok': False, 'error': {'code': error.code, 'message': error.message}}
    except (ValueError, TypeError, KeyError, ZeroDivisionError) as error:
        return {'schemaVersion': 1, 'ok': False, 'error': {'code': 'DOMAIN_ERROR', 'message': str(error)[:500]}}



from .api import solve, batch, execution_context

def execute(request):
    from .api import invoke
    return invoke(request, _execute)
