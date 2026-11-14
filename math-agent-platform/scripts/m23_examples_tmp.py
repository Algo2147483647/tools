from pathlib import Path
import json,csv
root=Path('math-agent-platform/example');root.mkdir(exist_ok=True)
suites={}
def add(suite,id,title,tool,args,checks=None,error=None,**extra):
 case={'id':id,'title':title,'request':{'schemaVersion':2,'tool':tool,'arguments':args},'checks':checks or []}
 if error:case['expectedError']=error
 case.update(extra);suites.setdefault(suite,[]).append(case)
def eq(path,value):return {'path':path,'equals':value}
def I(v):return {'kind':'Integer','value':str(v)}
def interval(a,b,lo=False,ro=False):return dict(kind='Interval',start=I(a),end=I(b),leftOpen=lo,rightOpen=ro)
s='01-foundations'
add(s,'exact-affine-latex','分数、隐式乘法和方程回代','exact_math',dict(expression=r'\frac{3}{2}x+\frac{1}{3}=\frac{22}{3}',format='latex'),[eq('value.result.candidate.value','14/3')])
add(s,'rational-powers','精确有理数、负指数与幂优先级','exact_math',dict(expression='(2/3)^-3 + 0.1^2 - 2^-4'),[eq('value.verification.status','passed')])
add(s,'scientific-rounding','极小科学计数法加法及精确舍入','exact_math',dict(operation='round',expression='1.234567890123456789e-20',digits=25,rounding='half_even'))
add(s,'negative-mod','负除数下取模约定','exact_math',dict(operation='mod',expression='19/3',other='-5/2'),[eq('value.result.value','-7/6')])
for operation,expected in [('floor','-3'),('ceil','-2'),('truncate','-2')]:add(s,'exact-'+operation,'负有理数 '+operation,'exact_math',dict(operation=operation,expression='-7/3'),[eq('value.result.value',expected)])
add(s,'large-compare','超过浮点安全整数范围的精确比较','exact_math',dict(operation='compare',expression='9007199254740993',other='9007199254740992'),[eq('value.result.value','1')])
add(s,'latex-matrix','混合分数、根式、下标和函数的矩阵解析','structure_math',dict(format='latex',expression=r'\begin{bmatrix}\frac{1}{3}&\sqrt{2}&x_{12}\\-2^2&\sin(\pi/2)&\frac{x^2-1}{x-1}\\0&1e-20&7\end{bmatrix}'),[eq('value.result.ir.kind','Matrix')])
suites[s].append({'id':'domain-roundtrip','title':'解析、化简、再次消费 MathIR 后仍保留排除点','steps':[{'id':'parse','request':{'schemaVersion':2,'tool':'structure_math','arguments':{'expression':r'\frac{x^2-1}{x-1}','format':'latex'}}},{'id':'simplify','request':{'schemaVersion':2,'tool':'symbolic_math','arguments':{'operation':'simplify','ir':{'$from':'parse.value.result.ir'}}}},{'id':'reuse','request':{'schemaVersion':2,'tool':'symbolic_math','arguments':{'operation':'simplify','ir':{'$from':'simplify.value.result.ir'}}}}],'checks':[{'path':'steps.reuse.value.result.domain.conditions','minLength':1},eq('steps.reuse.value.result.expression','x + 1')]})
add(s,'radical-branch','实数根式化简保留绝对值分支','algebra_math',dict(operation='radical_simplify',expression='sqrt(x^2)+sqrt(72)+sqrt(50)'))
for op in ['algebraic_add','algebraic_subtract','algebraic_multiply','algebraic_divide']:add(s,op,'代数数域运算 '+op,'algebra_math',dict(operation=op,expression='sqrt(2)+sqrt(3)',other='sqrt(2)-sqrt(3)'),[eq('value.result.ir.kind','Algebraic')])
add(s,'algebraic-equality','不同根式形式的精确相等判定','algebra_math',dict(operation='algebraic_equal',expression='(sqrt(2)+sqrt(3))^2',other='5+2*sqrt(6)'),[eq('value.result.equal',True)])
add(s,'minimal-polynomial','四次最小多项式和正实根隔离','algebra_math',dict(operation='minimal_polynomial',expression='sqrt(2)+sqrt(3)'),[eq('value.result.ir.polynomial',['1','0','-10','0','1'])])
for operation in ['factor','square_free']:add(s,'polynomial-'+operation,'高重数多项式分解与精确乘积检查','algebra_math',dict(operation=operation,expression='(x-1)^4*(x+2)^3*(x^2+1)'),[eq('value.verification.status','passed')])
add(s,'polynomial-division','非整除多项式商余式','algebra_math',dict(operation='divide',expression='x^7-3*x^4+2*x+7',other='x^3-x+1'))
add(s,'polynomial-gcd','具有公共因子的多项式最大公因式','algebra_math',dict(operation='gcd',expression='x^6-1',other='x^4-1'))
add(s,'resultant','二维曲线消元而非冒充完整解集','algebra_math',dict(operation='resultant',expression='x^2+y^2-5',other='x*y-2',variables=['x','y'],eliminate='x'))
add(s,'root-isolation','重根、无理根和复根混合时的完整实根隔离','algebra_math',dict(operation='isolate_roots',expression='(x-1)^4*(x+2)^2*(x^2-2)*(x^2+1)'),[eq('value.result.completeness','complete')])
for op in ['union','intersection','difference']:add(s,'set-'+op,'开闭端点与集合 '+op,'set_math',dict(operation=op,set=interval(-2,2,True),other=interval(0,3,False,True)))
add(s,'set-complement','补集保留孤立排除点','set_math',dict(operation='complement',set={'kind':'FiniteSet','elements':[I(0),{'kind':'Rational','numerator':'1','denominator':'2'}]},universe={'kind':'Universe','name':'Reals'}))
s='02-systems-and-matrices'
add(s,'excluded-root','化简可能产生的伪解必须排除','equation_math',dict(operation='single',equations=['(x^2-1)/(x-1)=2'],variables=['x']),[eq('value.result.solutionKind','empty')])
add(s,'radical-equation','根式方程的原式与定义域回代','equation_math',dict(operation='single',equations=['sqrt(x+2)=x'],variables=['x']))
add(s,'underdetermined','欠定线性系统的参数解','equation_math',dict(operation='linear_system',equations=['x+2*y+3*z=1','2*x+4*y+6*z=2'],variables=['x','y','z']),[eq('value.result.solutionKind','parametric')])
add(s,'parameter-rank-change','参数改变时唯一解、无解和参数解的分支','equation_math',dict(operation='linear_system',equations=['a*x+y=1','x+a*y=1'],variables=['x','y'],parameters=['a']),[eq('value.result.completeness','complete')])
add(s,'nonlinear-four-roots','圆与双曲线交点的四个精确实解','equation_math',dict(operation='polynomial_system',equations=['x^2+y^2=5','x*y=2'],variables=['x','y']),[{'path':'value.result.solutions','length':4}])
add(s,'positive-dimensional','正维系统保留未求解状态','equation_math',dict(operation='polynomial_system',equations=['x*y=0'],variables=['x','y']),[eq('value.result.state','unresolved')])
add(s,'inequality-domain','有理不等式组含极点、开端点和排除点','equation_math',dict(operation='inequalities',variables=['x'],inequalities=[dict(left='(x-1)/(x+2)',relation='>=',right='0'),dict(left='x',relation='<',right='5'),dict(left='x',relation='!=',right='2')]))
hilbert=[[f'1/{i+j+1}' for j in range(4)] for i in range(4)]
for op in ['determinant','rank','inverse']:add(s,'hilbert-'+op,'病态矩阵的精确 '+op,'matrix_math',dict(operation=op,matrix=hilbert))
add(s,'matrix-nullspace','秩亏矩阵的零空间基及秩零度检查','matrix_math',dict(operation='nullspace',matrix=[['1','2','3','4'],['2','4','6','8'],['0','1','1','0']]))
add(s,'matrix-parametric','矩阵接口返回自由参数','matrix_math',dict(operation='solve',matrix=[['1','2','3'],['2','4','6']],vector=['1','2']),[eq('value.result.solutionKind','parametric')])
add(s,'quadratic-inertia','含正、负、零方向的二次型','matrix_math',dict(operation='quadratic_form',matrix=[['2','1','0'],['1','-1','0'],['0','0','0']]),[eq('value.result.inertia',{'positive':1,'negative':1,'zero':1})])
design=[[1,i,i*i] for i in range(-3,4)]
for op in ['qr','svd']:add(s,'numeric-'+op,'矩形设计矩阵的分解、重构与正交检查','matrix_math',dict(operation=op,matrix=design),[eq('value.verification.status','passed')])
add(s,'least-squares','过定最小二乘残差与驻点检查','matrix_math',dict(operation='least_squares',matrix=design,vector=[8.9,4.2,1.1,0.2,1.2,4.1,9.3]))
add(s,'ill-conditioned-solve','小残差不等于高前向精度','matrix_math',dict(operation='solve',mode='numeric',matrix=[[1/(i+j+1) for j in range(8)] for i in range(8)],vector=[sum(1/(i+j+1) for j in range(8)) for i in range(8)]))
rr=[];cc=[];vv=[]
for i in range(20):
 for j in range(max(0,i-1),min(20,i+2)):rr.append(i);cc.append(j);vv.append(2 if i==j else -1)
add(s,'sparse-poisson','稀疏离散 Poisson 方程，不转稠密矩阵','matrix_math',dict(operation='sparse_solve',sparse=dict(shape=[20,20],rows=rr,columns=cc,values=vv),vector=[1]*20,precision=dict(maxIterations=100)))
add(s,'multi-root-certified','多根与重根的区间认证','numeric_math',dict(operation='roots',expression='(x-1)^4*(x+2)^2*(x^2-2)',interval=[-4,4]),[eq('value.result.completeness','complete')])
add(s,'transcendental-scan','超越函数多根扫描必须声明不完整','numeric_math',dict(operation='roots',expression='sin(3*x)*exp(-x^2/20)',interval=[-6,6],samples=150),[eq('value.result.completeness','partial')])
add(s,'nonlinear-local-root','多变量局部求根不声称全部根','numeric_math',dict(operation='system_root',expressions=['x^2+y^2-5','x*y-2'],variables=['x','y'],initialGuess=[2.2,0.8]),[eq('value.result.completeness','unknown')])
add(s,'eigenvalues','非对称矩阵的复特征值','numeric_math',dict(operation='eigenvalues',matrix=[[0,-1],[1,0]]))
add(s,'bounded-minimum','多峰函数的有界局部极小值','numeric_math',dict(operation='minimize',expression='(x-2)^2+sin(5*x)/5',interval=[-2,5]))
s='03-calculus'
add(s,'gradient','三变量梯度与有限差分交叉检查','calculus_math',dict(operation='gradient',expression='exp(x*y)+log(1+z^2)+x^2*y',variables=['x','y','z'],verifyAt=[0.2,0.3,0.4]))
add(s,'jacobian','向量函数 Jacobian 与变量顺序','calculus_math',dict(operation='jacobian',expressions=['exp(x*y)+sin(z)','log(1+x^2+y^2)+z^2','x*y*z'],variables=['x','y','z'],verifyAt=[0.3,-0.2,0.4]))
add(s,'hessian','耦合目标的三维 Hessian','calculus_math',dict(operation='hessian',expression='x^4+y^4+z^4+x*y*z+exp(x*y)',variables=['x','y','z'],verifyAt=[0.2,0.3,0.4]))
add(s,'mixed-partial','四阶混合偏导','calculus_math',dict(operation='partial',expression='x^2*y^3*sin(z)',variables=['x','y','z'],orders=[1,2,1]))
add(s,'implicit-derivative','隐函数导数保留曲线和非零偏导条件','calculus_math',dict(operation='implicit_derivative',expression='x^2+x*y+y^2=7',variables=['x','y']),[eq('value.result.ir.kind','Conditioned')])
add(s,'gaussian-improper','整条实轴上的 Gaussian 反常积分','calculus_math',dict(operation='integrate',expression='exp(-x^2)',variables=['x'],limits=[dict(variable='x',lower='-inf',upper='inf')]),[eq('value.result.convergence','convergent')])
add(s,'endpoint-singularity','端点奇点但积分收敛','calculus_math',dict(operation='integrate',expression='1/sqrt(x)',variables=['x'],limits=[dict(variable='x',lower='0',upper='1')]),[eq('value.result.expression','2')])
add(s,'no-principal-value','反常积分发散，不能以主值零代替','calculus_math',dict(operation='integrate',expression='1/x',variables=['x'],limits=[dict(variable='x',lower='-1',upper='1')]),[eq('value.result.convergence','divergent')])
add(s,'piecewise-integral','不同表达式的分段积分','calculus_math',dict(operation='piecewise_integrate',variables=['x'],segments=[dict(lower='-2',upper='0',expression='x^2'),dict(lower='0',upper='1',expression='sin(pi*x)'),dict(lower='1',upper='3',expression='1/x')]))
add(s,'triangular-double','三角形区域上的二重积分','calculus_math',dict(operation='integrate',expression='x+y',variables=['x','y'],limits=[dict(variable='x',lower='0',upper='y'),dict(variable='y',lower='0',upper='1')]),[eq('value.result.expression','1/2')])
add(s,'ordered-triple','0≤x≤y≤z≤1 上的三重积分','calculus_math',dict(operation='integrate',expression='x+y+z',variables=['x','y','z'],limits=[dict(variable='x',lower='0',upper='y'),dict(variable='y',lower='0',upper='z'),dict(variable='z',lower='0',upper='1')]),[eq('value.result.expression','1/4')])
add(s,'numerical-improper','数值反常积分误差估计不等于收敛证明','calculus_math',dict(operation='integrate',mode='numeric',expression='exp(-x)',variables=['x'],limits=[dict(variable='x',lower='0',upper='inf')]),[eq('value.result.convergence','unknown'),eq('value.result.errorBoundKind','estimated')])
add(s,'one-sided-limit','带方向的单侧极限','symbolic_math',dict(operation='limit',expression='abs(x)/x',point='0',direction='-'))
s='04-optimization'
add(s,'lp','线性规划的原始解、对偶值和 KKT','convex_optimize',dict(operation='linear_program',linear=[2,3],inequalityMatrix=[[-1,-1]],inequalityBounds=[-4],lower=[0,0]))
add(s,'portfolio-qp','含预算与持仓边界的凸二次规划','convex_optimize',dict(operation='quadratic_program',linear=[-0.1,-0.2,-0.15],quadratic=[[0.2,0.02,0.01],[0.02,0.4,0.03],[0.01,0.03,0.3]],equalityMatrix=[[1,1,1]],equalityBounds=[1],lower=[0,0,0],upper=[0.7,0.7,0.7]))
add(s,'soc-epigraph','二阶锥范数上图模型','convex_optimize',dict(operation='second_order_cone',linear=[0,0,1],equalityMatrix=[[1,0,0],[0,1,0]],equalityBounds=[3,4],cones=[dict(matrix=[[1,0,0],[0,1,0]],offset=[0,0],axis=[0,0,1],bound=0)]),[{'path':'value.result.objective','approx':5,'atol':1e-5}])
add(s,'constrained-ls','带归一化与非负约束的最小二乘','convex_optimize',dict(operation='least_squares',design=[[1,0],[0,1],[1,1],[2,1]],target=[0.2,0.7,1.1,1.3],equalityMatrix=[[1,1]],equalityBounds=[1],lower=[0,0]))
add(s,'farkas-certificate','不可行 LP 的精确 Farkas 证据','convex_optimize',dict(operation='linear_program',linear=[1],lower=[2],upper=[1]),[eq('value.diagnostics.certificate.status','verified')])
add(s,'unbounded-certificate','无界 LP 的可行点与下降射线','convex_optimize',dict(operation='linear_program',linear=[-1],lower=[0]),[eq('value.diagnostics.certificate.status','verified')])
def C(v):return dict(kind='constant',value=v)
def V(n):return dict(kind='variable',name=n)
def P(n):return dict(kind='parameter',name=n)
def N(kind,*args,**kw):return dict(kind=kind,args=list(args),**kw)
D=[[(-1 if j==i else 1 if j==i+1 else 0) for j in range(6)] for i in range(5)]
load=N('add',P('base'),V('power'))
objective=N('add',N('add',N('matmul',P('price'),V('power')),N('multiply',C(0.2),N('max',load))),N('add',N('multiply',C(0.05),N('sum_squares',N('matmul',P('difference'),V('power')))),C(7)))
add(s,'energy-scheduling','六时段充电：电价、峰值、平滑惩罚、能量和容量约束','convex_model',dict(operation='solve',variables=[dict(name='power',shape=[6],lower=0,upper=6)],parameters=dict(base=[2,1,4,3,2,1],price=[0.3,0.2,0.7,0.8,0.4,0.2],difference=D),objective=dict(expression=objective),constraints=[dict(name='energy',left=N('sum',V('power')),relation='=',right=C(18)),dict(name='capacity',left=load,relation='<=',right=C(8)),dict(name='rms_limit',left=N('norm',V('power'),order=2),relation='<=',right=C(10))]),notes='完整目标包含固定成本 7；max 的非光滑点可能使 KKT 检查不完整。')
residual=N('subtract',N('matmul',P('design'),V('beta')),P('response'))
add(s,'robust-regression','含离群点的 L1 残差与岭惩罚','convex_model',dict(operation='solve',variables=[dict(name='beta',shape=[2])],parameters=dict(design=[[0,1],[1,1],[2,1],[3,1],[4,1]],response=[1,3,5,20,9]),objective=dict(expression=N('add',N('norm',residual,order=1),N('add',N('multiply',C(0.1),N('sum_squares',V('beta'))),C(3)))),constraints=[dict(name='positive_slope',left=N('index',V('beta'),index=0),relation='>=',right=C(0))]))
add(s,'maximize-full-objective','最大化、范数约束和常数项','convex_model',dict(operation='solve',variables=[dict(name='x',shape=[2])],objective=dict(sense='maximize',expression=N('add',N('matmul',C([1,2]),V('x')),C(5))),constraints=[dict(name='unit_ball',left=N('norm',V('x'),order=2),relation='<=',right=C(1))]),[{'path':'value.result.objective','approx':7.2360679775,'atol':1e-5}])
s='05-data-and-plots'
with (root/'measurements.csv').open('w',newline='',encoding='utf-8') as f:
 writer=csv.writer(f);writer.writerow(['time','signal','group'])
 for i in range(1,31):writer.writerow([i,'' if i in (8,19) else 1.8*i+3+([-0.2,0.1,0.3,-0.1][i%4])+(12 if i==24 else 0),'A' if i<=15 else 'B'])
for op,args in [('overview',{}),('describe',dict(columns=['time','signal'])),('correlation',dict(columns=['time','signal'])),('regression',dict(columns=['time','signal'])),('group_by',dict(groupColumn='group',columns=['signal'],aggregate='mean')),('filter',dict(filters=[dict(column='time',operator='ge',value='20')]))]:
 add(s,'data-'+op,'含缺失值和离群点的数据 '+op,'analyze_data',dict(operation=op,datasetId='example-measurements',missingPolicy='drop',**args),datasetFile='measurements.csv')
for op in ['scatter','line','histogram','regression']:
 add(s,'plot-'+op,'真实图像产物 '+op,'plot_math',dict(operation=op,datasetId='example-measurements',xColumn='time' if op!='histogram' else 'signal',**({'yColumn':'signal'} if op!='histogram' else {}),missingPolicy='drop',title='Measured signal with missing data and an outlier'),datasetFile='measurements.csv')
add(s,'function-plots','振荡、包络与断点的函数图','plot_math',dict(operation='function',expressions=['exp(-x^2/12)*sin(4*x)','1/(x-1)'],interval=[-5,5],samples=800,title='Oscillation and a pole'))
s='06-boundaries'
add(s,'latex-ambiguity','禁止猜测无括号函数参数','structure_math',dict(expression=r'\sin x',format='latex'),error='INVALID_ARGUMENT')
add(s,'exact-float-rejected','精确矩阵不接受隐式浮点数','matrix_math',dict(operation='inverse',matrix=[[0.1,0],[0,1]]),error='INVALID_ARGUMENT')
add(s,'singular-inverse','奇异矩阵不能返回逆','matrix_math',dict(operation='inverse',matrix=[['1','2'],['2','4']]),error='SINGULAR_MATRIX')
add(s,'wrong-linear-system','非线性方程不能伪装成线性系统','equation_math',dict(operation='linear_system',equations=['x*y=1'],variables=['x','y']),error='INVALID_ARGUMENT')
add(s,'polynomial-budget','展开前阻止次数爆炸','algebra_math',dict(operation='factor',expression='((x+1)^20+1)^20'),error='RESOURCE_LIMIT')
add(s,'undefined-integral-domain','化简不能抹掉积分的原始定义域','calculus_math',dict(operation='integrate',expression='sqrt(x)^0',variables=['x'],limits=[dict(variable='x',lower='-2',upper='-1')]),error='DOMAIN_ERROR')
add(s,'unsupported-certified-backend','未接入认证后端时明确拒绝','numeric_math',dict(operation='integrate',expression='sin(x)',interval=[0,1],precision=dict(mode='certified')),error='UNSUPPORTED_PRECISION')
add(s,'missing-universe','补集必须声明全集','set_math',dict(operation='complement',set=dict(kind='FiniteSet',elements=[I(1)])),error='INVALID_ARGUMENT')
add(s,'nonconvex-product','非凸变量乘积不能静默标准化','convex_model',dict(operation='solve',variables=[dict(name='x')],objective=dict(expression=N('multiply',V('x'),V('x')))),error='DCP_UNRECOGNIZED')
add(s,'numeric-multiple-not-claimed','数值多重积分不伪造总误差界','calculus_math',dict(operation='integrate',mode='numeric',expression='x+y',variables=['x','y'],limits=[dict(variable='x',lower='0',upper='1'),dict(variable='y',lower='0',upper='1')]),error='UNSUPPORTED')
for suite,cases in suites.items():(root/(suite+'.json')).write_text(json.dumps({'suite':suite,'cases':cases},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Created',sum(len(v) for v in suites.values()),'cases in',len(suites),'suites.')
