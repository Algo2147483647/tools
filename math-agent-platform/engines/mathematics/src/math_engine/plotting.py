import ast, base64, io, json, math, os, re, sys, time, warnings
import sympy as sp
import numpy as np
from .common import *
from .statistics import frame, numeric_columns
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
                expr=expression(source);fn=numeric_function(expr,x,source=source);ys=np.asarray(fn(xs),dtype=float)
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

