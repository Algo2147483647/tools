import ast, base64, io, json, math, os, re, sys, time, warnings
import sympy as sp
import numpy as np
from .common import *
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

