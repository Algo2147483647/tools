from pathlib import Path
import json
root=Path('math-agent-platform/example')
def add(file,id,title,tool,args,checks=None):
 p=root/file;s=json.loads(p.read_text(encoding='utf-8'));s['cases'].append({'id':id,'title':title,'request':{'schemaVersion':2,'tool':tool,'arguments':args},'checks':checks or []});p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for operation,expression in [('expand','(x+2*y)^4-(x-y)^4'),('factor','x^6-y^6'),('solve','x^4-5*x^2+4=0'),('differentiate','exp(x^2)*sin(x)'),('integrate','x*exp(-x^2)')]:
 add('01-foundations.json','symbolic-'+operation,'符号接口 '+operation,'symbolic_math',dict(operation=operation,expression=expression))
add('01-foundations.json','set-normalize','自动去重并保持精确集合元素','set_math',dict(operation='normalize',set={'kind':'FiniteSet','elements':[{'kind':'Integer','value':'1'},{'kind':'Rational','numerator':'2','denominator':'2'}]}))
add('02-systems-and-matrices.json','legacy-linear-solve','原数值接口的线性解及条件数','numeric_math',dict(operation='linear_solve',matrix=[[3,1],[1,2]],vector=[9,8]))
add('02-systems-and-matrices.json','single-bracket-root','单个连续变号区间的数值根','numeric_math',dict(operation='root',expression='cos(x)-x',interval=[0,1]))
add('03-calculus.json','finite-quadrature','有限区间的自适应求积与误差估计','numeric_math',dict(operation='integrate',expression='exp(-x^2)*cos(3*x)',interval=[-2,2]))
p=root/'05-data-and-plots.json';s=json.loads(p.read_text(encoding='utf-8'))
def N(k,*args,**kw):return dict(kind=k,args=list(args),**kw)
def C(v):return dict(kind='constant',value=v)
V=dict(kind='variable',name='allocation')
objective=N('add',N('multiply',C({'$from':'fit.value.result.slope'}),N('max',V)),N('add',N('multiply',C(0.2),N('sum_squares',V)),C({'$from':'fit.value.result.intercept'})))
s['cases'].append({'id':'fit-then-plan','title':'数据拟合结果直接进入带峰值和平滑成本的优化模型','datasetFile':'measurements.csv','steps':[{'id':'fit','request':{'schemaVersion':2,'tool':'analyze_data','arguments':dict(operation='regression',datasetId='example-measurements',columns=['time','signal'],missingPolicy='drop')}},{'id':'plan','request':{'schemaVersion':2,'tool':'convex_model','arguments':dict(operation='solve',variables=[dict(name='allocation',shape=[6],lower=0,upper=6)],objective=dict(expression=objective),constraints=[dict(name='total',left=N('sum',V),relation='=',right=C(18))])}}],'checks':[{'path':'steps.plan.value.result.status','equals':'optimal'}],'notes':'回归是统计估计，不会因为随后完成凸优化而变成确定事实；拟合与求解证据分开保存。'})
p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(sum(len(json.loads(p.read_text(encoding='utf-8'))['cases']) for p in root.glob('[0-9]*.json')))
