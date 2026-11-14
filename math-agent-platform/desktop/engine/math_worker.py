"""One bounded mathematical request per process. No eval, exec or user code."""
import ast, base64, io, json, math, os, re, sys, time, warnings

class ToolError(Exception):
    def __init__(self, code, message): self.code, self.message = code, message; super().__init__(message)

def resource_limits():
    if os.name != 'nt':
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1536*1024**2, 1536*1024**2))
            resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
        except (ImportError, ValueError, OSError): pass
        return
    import ctypes as c
    from ctypes import wintypes as w
    class BASIC(c.Structure):
        _fields_=[('processTime',c.c_int64),('jobTime',c.c_int64),('flags',w.DWORD),('minWS',c.c_size_t),('maxWS',c.c_size_t),('active',w.DWORD),('affinity',c.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
    class IO(c.Structure): _fields_=[(n,c.c_uint64) for n in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
    class LIMIT(c.Structure): _fields_=[('basic',BASIC),('io',IO),('processMemory',c.c_size_t),('jobMemory',c.c_size_t),('peakProcess',c.c_size_t),('peakJob',c.c_size_t)]
    kernel=c.WinDLL('kernel32',use_last_error=True)
    kernel.CreateJobObjectW.argtypes=[c.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
    kernel.SetInformationJobObject.argtypes=[w.HANDLE,c.c_int,c.c_void_p,w.DWORD];kernel.SetInformationJobObject.restype=w.BOOL
    kernel.GetCurrentProcess.restype=w.HANDLE
    kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];kernel.AssignProcessToJobObject.restype=w.BOOL
    job=kernel.CreateJobObjectW(None,None);limits=LIMIT()
    limits.basic.flags=0x100|0x2000|0x8|0x2 # process memory, kill-on-close, active-process count, CPU
    limits.basic.active=1;limits.basic.processTime=25*10_000_000;limits.processMemory=1024**3
    if not job or not kernel.SetInformationJobObject(job,9,c.byref(limits),c.sizeof(limits)) or not kernel.AssignProcessToJobObject(job,kernel.GetCurrentProcess()):
        raise ToolError('ISOLATION_FAILED','Cannot establish mathematical worker resource limits.')
    global JOB_HANDLE
    JOB_HANDLE=job

for key in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','NUMEXPR_NUM_THREADS'): os.environ[key]='1'
resource_limits()
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

def symbolic(args):
    op=args['operation'];domain=args.get('domain','real');x=symbol(args.get('variable','x'),domain)
    source=args['expression'];checks=[];notes=[]
    if op=='solve' and '=' in source:
        if source.count('=')!=1:raise ToolError('INVALID_ARGUMENT','Supply one equation with one equals sign.')
        left,right=source.split('=');expr=expression(left,domain)-expression(right,domain)
    else:expr=expression(source,domain)
    assumptions=['Symbols are '+domain+'.']
    if op in ('simplify','expand','factor'):result={'simplify':sp.simplify,'expand':sp.expand,'factor':sp.factor}[op](expr);check=sp.simplify(expr-result)==0;checks=[{'name':'symbolic equivalence','passed':check}]
    elif op=='differentiate':result=sp.diff(expr,x,args.get('order',1))
    elif op=='integrate':
        if args.get('interval') is not None:
            a,b=interval(args);result=sp.integrate(expr,(x,sp.Rational(str(a)),sp.Rational(str(b))))
        else:
            result=sp.integrate(expr,x);notes.append('Indefinite integral is reported without the arbitrary additive constant.')
            if not result.has(sp.Integral):checks=[{'name':'differentiate antiderivative','passed':sp.simplify(sp.diff(result,x)-expr)==0}]
    elif op=='limit':
        point=args.get('point','0');point=sp.oo if point=='inf' else -sp.oo if point=='-inf' else expression(point,domain)
        if point.free_symbols:raise ToolError('INVALID_ARGUMENT','Limit point must be constant.')
        result=sp.limit(expr,x,point,dir=args.get('direction','+'))
    elif op=='solve':
        if expr.free_symbols-{x}:raise ToolError('INVALID_ARGUMENT','This solver accepts one variable; substitute other symbols first.')
        result=sp.solveset(expr,x,domain=sp.S.Reals if domain=='real' else sp.S.Complexes)
        if isinstance(result,sp.FiniteSet):
            checks=[{'name':'substitution '+str(v),'passed':sp.simplify(expr.subs(x,v))==0} for v in result]
        status='unresolved' if result.has(sp.ConditionSet) else 'no_solution' if result is sp.S.EmptySet else 'solved'
        return value_result({'kind':'solution_set','expression':str(result),'latex':sp.latex(result),'state':status,'variable':str(x),'domain':domain},[math_view(result,'Solution set')],{'engine':'SymPy','version':sp.__version__},checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Substitution of returned finite roots only; completeness is solver-reported.',checks),assumptions)
    else:raise ToolError('UNSUPPORTED','Unsupported symbolic operation.')
    unresolved=result.has(sp.Integral,sp.Derivative,sp.Limit)
    if unresolved:notes.append('The symbolic engine returned an unevaluated expression.')
    return value_result({'kind':'expression','expression':str(result),'latex':sp.latex(result),'exact':not result.has(sp.Float),'state':'unresolved' if unresolved else 'computed'},[math_view(result)],{'engine':'SymPy','version':sp.__version__},checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Symbolic consistency checks use the same engine, not an independent proof.',checks),assumptions,notes)

def numeric(args):
    from scipy import optimize,integrate,linalg
    op=args['operation'];tol=number(args.get('tolerance',1e-8));notes=[]
    if not 1e-12<=tol<=1e-2:raise ToolError('INVALID_ARGUMENT','Tolerance must be between 1e-12 and 1e-2.')
    diagnostics={'engine':'SciPy/NumPy','tolerance':tol};checks=[]
    if op in ('linear_solve','eigenvalues'):
        a=np.asarray(args.get('matrix'),dtype=float)
        if a.ndim!=2 or a.shape[0]!=a.shape[1] or not 1<=a.shape[0]<=50 or not np.isfinite(a).all():raise ToolError('INVALID_ARGUMENT','Supply a finite square matrix of size 1–50.')
        if op=='linear_solve':
            b=np.asarray(args.get('vector'),dtype=float)
            if b.shape!=(a.shape[0],) or not np.isfinite(b).all():raise ToolError('INVALID_ARGUMENT','Vector length must match the matrix.')
            v=linalg.solve(a,b);residual=float(linalg.norm(a@v-b));condition=float(np.linalg.cond(a));diagnostics.update(residual=residual,conditionNumber=condition if np.isfinite(condition) else None)
            if condition>1e10:notes.append('The matrix is ill-conditioned; small input changes may strongly affect the solution.')
            checks=[{'name':'linear residual','passed':residual<=tol*max(1,float(linalg.norm(b)))}]
            result={'kind':'vector','values':[float(x) for x in v],'exact':False};view=table_view(['Index','Value'],[[i,float(x)] for i,x in enumerate(v)],'Linear solution')
        else:
            values=linalg.eigvals(a);result={'kind':'vector','values':[{'real':float(v.real),'imag':float(v.imag)} for v in values],'exact':False};view=table_view(['Real','Imaginary'],[[float(v.real),float(v.imag)] for v in values],'Eigenvalues')
        return value_result(result,[view],diagnostics,checked('passed' if checks and all(c['passed'] for c in checks) else 'not_checked','Numerical residual only.',checks),notes=notes)
    expr=expression(args['expression']);x=symbol(args.get('variable','x'));fn=numeric_function(expr,x);a,b=interval(args)
    def scalar(v):
        out=float(fn(v))
        if not math.isfinite(out):raise ToolError('DOMAIN_ERROR','Non-finite value encountered in the requested interval.')
        return out
    if op=='root':
        root,info=optimize.brentq(scalar,a,b,xtol=tol,full_output=True,maxiter=200,disp=False);residual=abs(scalar(root));diagnostics.update(converged=bool(info.converged),iterations=0 if root in (a,b) else int(info.iterations),residual=residual,method='brentq')
        if not info.converged or residual>tol*10:raise ToolError('NOT_CONVERGED','Root finding did not satisfy the residual tolerance; check continuity and the bracket.')
        value=root;checks=[{'name':'root residual','passed':True}]
    elif op=='integrate':
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always');value,estimate=integrate.quad(scalar,a,b,epsabs=tol,epsrel=tol,limit=100)
        if caught or estimate>max(tol,tol*abs(value))*2:raise ToolError('NOT_CONVERGED','Integration did not meet the error target; split the interval or inspect singularities.')
        diagnostics.update(estimatedAbsoluteError=estimate,method='quad',converged=True);checks=[{'name':'estimated integration error','passed':True}]
    elif op=='minimize':
        info=optimize.minimize_scalar(scalar,bounds=(a,b),method='bounded',options={'xatol':tol,'maxiter':500})
        if not info.success:raise ToolError('NOT_CONVERGED','Bounded minimization did not converge.')
        value=float(info.x);diagnostics.update(method='bounded',converged=True,functionValue=float(info.fun),iterations=int(info.nit));notes.append('Bounded local search; a global minimum is not certified. Endpoints are not automatically selected.')
    else:raise ToolError('UNSUPPORTED','Unsupported numeric operation.')
    return value_result({'kind':'scalar','value':str(value),'exact':False},[math_view(sp.Float(value,15),'Numerical result')],diagnostics,checked('passed' if checks else 'not_checked','Floating-point numerical checks, not an exact proof.',checks),['Real-valued function on the supplied interval.'],notes)

def frame(dataset):
    import pandas as pd
    if not dataset or not isinstance(dataset.get('columns'),list) or not isinstance(dataset.get('rows'),list):raise ToolError('DATASET_REQUIRED','Select an imported dataset.')
    return pd.DataFrame(dataset['rows'],columns=dataset['columns'])

def numeric_columns(df,columns,policy):
    import pandas as pd
    if not columns or any(c not in df.columns for c in columns):raise ToolError('INVALID_ARGUMENT','Select existing numeric columns.')
    converted=df[columns].apply(pd.to_numeric,errors='coerce').replace([np.inf,-np.inf],np.nan)
    rejected=int(converted.isna().any(axis=1).sum())
    if rejected and policy=='reject':raise ToolError('MISSING_DATA','Selected columns contain missing or non-numeric values. Specify missingPolicy="drop" to exclude affected rows.')
    clean=converted.dropna();notes=[f'Excluded {rejected} rows with missing or non-numeric values.'] if rejected else []
    if clean.empty:raise ToolError('INSUFFICIENT_DATA','No numeric rows remain.')
    return clean,notes,rejected

def safe_cell(v):
    if v is None:return None
    if isinstance(v,(int,float,np.integer,np.floating)):return float(v) if math.isfinite(float(v)) else None
    return str(v)[:2000]

def analysis(args,dataset):
    import pandas as pd
    from scipy import stats
    df=frame(dataset);op=args['operation'];policy=args.get('missingPolicy','reject');notes=[];n=len(df)
    diagnostics={'engine':'pandas/SciPy','datasetId':args['datasetId'],'sourceRows':n,'missingPolicy':policy}
    if op=='overview':
        rows=[[c,str(df[c].dtype),int(df[c].isna().sum()),int(df[c].nunique(dropna=True))] for c in df.columns]
        return value_result({'kind':'dataset_summary','rows':n,'columns':len(df.columns)},[table_view(['Column','Storage type','Missing','Distinct'],rows,'Dataset overview'),table_view(df.columns,[[safe_cell(v) for v in row] for row in df.head(10).itertuples(index=False,name=None)],'Preview',n)],diagnostics)
    columns=args.get('columns')
    if op=='filter':
        filtered=df
        for condition in args.get('filters',[]):
            column=condition['column'];operator=condition['operator'];value=condition['value']
            if column not in df.columns:raise ToolError('INVALID_ARGUMENT','Unknown filter column.')
            series=filtered[column]
            if operator in ('gt','ge','lt','le'):
                series=pd.to_numeric(series,errors='coerce');value=number(value)
            else:series=series.astype('string');value=str(value)
            mask={'eq':lambda:series==value,'ne':lambda:series!=value,'gt':lambda:series>value,'ge':lambda:series>=value,'lt':lambda:series<value,'le':lambda:series<=value}[operator]()
            filtered=filtered[mask.fillna(False)]
        rows=[[safe_cell(v) for v in row] for row in filtered.head(200).itertuples(index=False,name=None)]
        if len(filtered)>200:notes.append('Table displays the first 200 matching rows.')
        return value_result({'kind':'filtered_table','matchedRows':len(filtered),'displayedRows':len(rows)},[table_view(df.columns,rows,'Filtered data',len(filtered))],diagnostics,notes=notes)
    if not columns:columns=[c for c in df.columns if pd.to_numeric(df[c],errors='coerce').notna().any()]
    clean,notes,dropped=numeric_columns(df,columns,policy);diagnostics.update(usedRows=len(clean),droppedRows=dropped)
    if op=='describe':
        summary=clean.describe().T;rows=[[str(i)]+[safe_cell(v) for v in row] for i,row in zip(summary.index,summary.to_numpy())];view=table_view(['Column']+list(summary.columns),rows,'Descriptive statistics')
        result={'kind':'statistics','usedRows':len(clean),'columns':columns,'summary':rows}
    elif op=='correlation':
        if len(clean)<3:raise ToolError('INSUFFICIENT_DATA','Correlation requires at least three complete rows.')
        matrix=clean.corr(method='pearson');rows=[[str(i)]+[safe_cell(v) for v in row] for i,row in zip(matrix.index,matrix.to_numpy())];view=table_view(['Column']+list(matrix.columns),rows,'Pearson correlation');result={'kind':'correlation','columns':columns,'matrix':rows}
        notes.append('Correlation does not establish causation. Constant columns have undefined correlations.')
    elif op=='regression':
        if len(columns)!=2 or len(clean)<3:raise ToolError('INSUFFICIENT_DATA','Linear regression requires exactly two columns and at least three complete rows.')
        x,y=clean[columns[0]].to_numpy(),clean[columns[1]].to_numpy()
        if np.ptp(x)==0:raise ToolError('DOMAIN_ERROR','Predictor column is constant.')
        fit=stats.linregress(x,y);values={'slope':safe_cell(fit.slope),'intercept':safe_cell(fit.intercept),'rSquared':safe_cell(fit.rvalue**2),'pValue':safe_cell(fit.pvalue),'standardError':safe_cell(fit.stderr)}
        result={'kind':'regression','predictor':columns[0],'response':columns[1],**values};view=table_view(['Metric','Value'],list(values.items()),'Linear regression');notes.append('Ordinary least-squares fit; inferential statistics assume a suitable linear model and independent errors.')
    elif op=='group_by':
        group=args.get('groupColumn');aggregate=args.get('aggregate','mean')
        if group not in df.columns:raise ToolError('INVALID_ARGUMENT','Select an existing groupColumn.')
        grouped=clean.copy();group_keys=df.loc[clean.index,group].fillna('(missing)').astype(str)
        table=grouped.groupby(group_keys,sort=True)[columns].agg(aggregate);rows=[[str(i)]+[safe_cell(v) for v in row] for i,row in zip(table.index,table.to_numpy())];view=table_view([group]+columns,rows,'Grouped '+aggregate);result={'kind':'grouped_statistics','groups':len(table),'aggregate':aggregate}
        if len(table)>200:notes.append('Table displays the first 200 groups.')
    else:raise ToolError('UNSUPPORTED','Unsupported analysis operation.')
    return value_result(result,[view],diagnostics,checked('not_checked','Statistical computation; model assumptions are not independently verified.'),notes=notes)

def plot(args,dataset):
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt
    kind=args['operation'];notes=[];diagnostics={'engine':'Matplotlib','plotType':kind}
    plt.rcParams.update({'font.family':'sans-serif','font.sans-serif':['Microsoft YaHei','DejaVu Sans'],'axes.unicode_minus':False})
    fig,ax=plt.subplots(figsize=(8,4.5),dpi=130)
    try:
        if kind=='function':
            a,b=interval(args);x=symbol(args.get('variable','x'));count=args.get('samples',600);xs=np.linspace(a,b,count)
            expressions=args.get('expressions') or [args.get('expression','')]
            for source in expressions:
                expr=expression(source);fn=numeric_function(expr,x);ys=np.asarray(fn(xs),dtype=float)
                if ys.ndim==0:ys=np.full_like(xs,float(ys))
                ys=np.where(np.isfinite(ys),ys,np.nan)
                try:
                    singular=sp.singularities(expr,x)
                    if isinstance(singular,sp.FiniteSet):
                        for point in singular:
                            if point.is_real and a<=float(point)<=b:
                                j=int(np.argmin(abs(xs-float(point))));ys[max(0,j-1):min(count,j+2)]=np.nan
                except (NotImplementedError,TypeError,ValueError):pass
                delta=np.abs(np.diff(ys));finite=delta[np.isfinite(delta)];threshold=max(float(np.median(finite))*50,1) if len(finite) else math.inf
                ys[1:][delta>threshold]=np.nan
                if not np.isfinite(ys).any():raise ToolError('DOMAIN_ERROR','No finite values in the plotting interval.')
                ax.plot(xs,ys,label=source[:80])
            ax.set_xlabel(str(x));ax.set_ylabel('f('+str(x)+')');ax.legend();diagnostics.update(interval=[a,b],samples=count)
            notes.append('Sampled plot with discontinuity breaks; it is not a proof of continuity or extrema.')
        else:
            df=frame(dataset);columns=[args.get('xColumn')]
            if kind in ('scatter','line','regression'):columns.append(args.get('yColumn'))
            clean,dropped_notes,dropped=numeric_columns(df,columns,args.get('missingPolicy','reject'));notes.extend(dropped_notes);diagnostics.update(datasetId=args.get('datasetId'),usedRows=len(clean),droppedRows=dropped)
            x=clean[columns[0]].to_numpy();ax.set_xlabel(columns[0])
            if kind=='histogram':ax.hist(x,bins=args.get('bins',20),color='#5179ce',edgecolor='white');ax.set_ylabel('Count')
            else:
                y=clean[columns[1]].to_numpy();ax.set_ylabel(columns[1])
                if kind=='line':order=np.argsort(x);ax.plot(x[order],y[order])
                else:ax.scatter(x,y,s=15,alpha=.7)
                if kind=='regression':
                    from scipy.stats import linregress
                    if len(x)<3 or np.ptp(x)==0:raise ToolError('INSUFFICIENT_DATA','Regression plot needs three rows and a varying predictor.')
                    fit=linregress(x,y);grid=np.array([min(x),max(x)]);ax.plot(grid,fit.intercept+fit.slope*grid,color='#d36a44',label='Linear fit');ax.legend()
        ax.set_title(args.get('title','')[:160]);ax.grid(alpha=.2);fig.tight_layout();buffer=io.BytesIO();fig.savefig(buffer,format='png');encoded=base64.b64encode(buffer.getvalue()).decode('ascii')
        return value_result({'kind':'plot','plotType':kind,'summary':args.get('title') or kind+' plot'},[{'kind':'image','title':args.get('title') or 'Plot','mimeType':'image/png','data':encoded}],diagnostics,checked('not_checked','Visualization of sampled or supplied data.'),notes=notes)
    finally:plt.close(fig)

def main():
    raw=sys.stdin.buffer.read(4*1024*1024+1)
    if len(raw)>4*1024*1024:raise ToolError('RESOURCE_LIMIT','Request exceeds 4 MB.')
    request=json.loads(raw);tool=request['tool'];args=request['arguments']
    if tool=='symbolic_math':output=symbolic(args)
    elif tool=='numeric_math':output=numeric(args)
    elif tool=='plot_math':output=plot(args,request.get('dataset'))
    elif tool=='analyze_data':output=analysis(args,request.get('dataset'))
    else:raise ToolError('UNKNOWN_TOOL','Unknown mathematical tool.')
    output['diagnostics']['resourceLimitMB']=1024
    print(json.dumps({'ok':True,'value':output},ensure_ascii=False,allow_nan=False),flush=True)

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
    try:main()
    except ToolError as error:print(json.dumps({'ok':False,'error':{'code':error.code,'message':error.message}}),flush=True)
    except (ValueError,TypeError,KeyError,ZeroDivisionError,np.linalg.LinAlgError) as error:print(json.dumps({'ok':False,'error':{'code':'DOMAIN_ERROR','message':str(error)[:500]}}),flush=True)
    except Exception:
        import traceback;traceback.print_exc(file=sys.stderr)
        print(json.dumps({'ok':False,'error':{'code':'ENGINE_ERROR','message':'Mathematical engine could not complete this operation.'}}),flush=True)
