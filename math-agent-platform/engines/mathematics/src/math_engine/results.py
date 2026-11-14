"""Version-two semantics layered over the version-one payloads."""
from copy import deepcopy


def normalize(value, tool, arguments):
    value = deepcopy(value)
    result = value['result']
    if result.get('ir') is not None or 'inputIR' in result:result.setdefault('irVersion',1)
    old_state = result.get('state')
    if old_state is not None: result['legacyState'] = old_state
    result['state'] = old_state if old_state in ('partial', 'unresolved') else 'computed'
    result.setdefault('representation', 'exact' if tool == 'exact_math' or (tool == 'symbolic_math' and result.get('exact', True)) else 'approximate')
    solving = arguments.get('operation') in ('solve', 'root')
    result.setdefault('completeness', 'unknown' if solving else 'not_applicable')
    if tool == 'exact_math' and arguments.get('operation','evaluate')=='evaluate': result['completeness'] = 'complete'
    result.setdefault('domain', dict(declared=arguments.get('domain', 'real'), conditions=value['assumptions'],
                            exclusions=[], analysisComplete=tool == 'exact_math'))
    if tool == 'symbolic_math' and solving:
        result['solverReportedCompleteness'] = 'unknown' if old_state == 'unresolved' else 'complete'
    verification = value['verification']
    evidence = 'exact_arithmetic' if tool == 'exact_math' else 'symbolic_consistency' if tool == 'symbolic_math' else 'numerical_residual'
    for check in verification.get('checks', []):
        check.setdefault('status', 'passed' if check.get('passed') else 'failed')
        check.setdefault('evidence', evidence)
    from .precision import check_status
    verification['status'] = check_status(verification.get('checks', []))
    verification['evidence'] = sorted(set(c['evidence'] for c in verification.get('checks', [])))
    if verification['status'] in ('failed', 'unknown') and result['state'] == 'computed':
        result['state'] = 'partial'
    return value
