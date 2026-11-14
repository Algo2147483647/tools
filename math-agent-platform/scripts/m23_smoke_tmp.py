import sys,json
sys.path.insert(0,'math-agent-platform/engines/mathematics/src')
from math_engine import solve
cases=[('equation_math',dict(operation='linear_system',equations=['a*x+y=1','x+a*y=1'],variables=['x','y'],parameters=['a'])),('equation_math',dict(operation='polynomial_system',equations=['x^2+y^2=5','x*y=2'],variables=['x','y'])),('matrix_math',dict(operation='solve',matrix=[['1','2','3'],['2','4','6']],vector=['1','2'])),('matrix_math',dict(operation='svd',matrix=[[1,2],[3,4],[5,6]])),('calculus_math',dict(operation='hessian',expression='exp(x*y)+x^2*y',variables=['x','y'],verifyAt=[0.2,0.3])),('calculus_math',dict(operation='integrate',expression='x+y',variables=['x','y'],limits=[dict(variable='x',lower='0',upper='y'),dict(variable='y',lower='0',upper='1')])),('calculus_math',dict(operation='integrate',expression='1/x',variables=['x'],limits=[dict(variable='x',lower='-1',upper='1')])),('convex_model',dict(operation='solve',variables=[dict(name='x',shape=[2],lower=0)],objective=dict(expression=dict(kind='add',args=[dict(kind='sum_squares',args=[dict(kind='subtract',args=[dict(kind='variable',name='x'),dict(kind='constant',value=[1,2])])]),dict(kind='constant',value=7)])))),('convex_optimize',dict(operation='linear_program',linear=[1],lower=[2],upper=[1]))]
for tool,args in cases:
 try:
  r=solve(tool=tool,arguments=args,schema_version=2)
  print(tool,args['operation'],json.dumps({'ok':r['ok'],'error':r.get('error'),'result':r.get('value',{}).get('result'),'verification':r.get('value',{}).get('verification',{}).get('status'),'certificate':r.get('value',{}).get('diagnostics',{}).get('certificate')},default=str)[:1800])
 except Exception as e:
  import traceback;traceback.print_exc()
