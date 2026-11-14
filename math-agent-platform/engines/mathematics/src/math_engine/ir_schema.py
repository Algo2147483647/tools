"""Public recursive MathIR v1 schema, shared by worker and generated TS contracts."""
REF={'$ref':'#/$defs/MathIR'}


def obj(kind,**props):
    fields={'kind':{'const':kind},**props}
    return {'type':'object','properties':fields,'required':list(fields),'additionalProperties':False}


def array(items,minimum=0,maximum=512):
    return {'type':'array','items':items,'minItems':minimum,'maxItems':maximum}


INTEGER={'type':'string','pattern':r'^-?\d{1,1234}$'}
NAME={'type':'string','pattern':r'^[A-Za-z][A-Za-z0-9_]{0,23}$'}
MATH_IR_VARIANTS=[
    obj('Integer',value=INTEGER),
    obj('DecimalLiteral',value={'type':'string','minLength':1,'maxLength':256,'pattern':r'^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$'}),
    obj('Rational',numerator=INTEGER,denominator={'type':'string','pattern':r'^[1-9]\d{0,1233}$'}),
    obj('Symbol',name=NAME),obj('Constant',name={'enum':['pi','E']}),
    obj('Unary',operator={'enum':['+','-']},args=array(REF,1,1)),
    *[obj(kind,args=array(REF,2,2)) for kind in ('Add','Subtract','Multiply','Divide','Power','Equation','Union','Intersection','Complement')],
    obj('Function',name={'enum':['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','exp','log','sqrt','abs']},args=array(REF,1,1)),
    obj('Matrix',rows=array(array(REF,1,100),1,100)),
    obj('Restricted',expression=REF,source=REF),
    obj('Conditioned',expression=REF,conditions=array(REF,1,16)),
    obj('Relation',relation={'enum':['!=','<','<=','>','>=']},args=array(REF,2,2)),
    obj('Algebraic',polynomial=array({'type':'string','pattern':r'^-?\d{1,256}$'},2,17),realRootIndex={'type':'integer','minimum':0,'maximum':15}),
    obj('EmptySet'),obj('Universe',name={'enum':['Reals','Integers']}),
    obj('FiniteSet',elements=array(REF,0,100)),
    obj('Interval',start={'anyOf':[REF,{'enum':['-inf']}]},end={'anyOf':[REF,{'enum':['inf']}]},leftOpen={'type':'boolean'},rightOpen={'type':'boolean'})
]
# Dispatch by kind before recursively validating children. A recursive oneOf
# would revisit every binary branch for each operator and grow exponentially.
MATH_IR_SCHEMA={'type':'object','required':['kind'],
    'properties':{'kind':{'enum':[v['properties']['kind']['const'] for v in MATH_IR_VARIANTS]}},
    'allOf':[{'if':{'properties':{'kind':v['properties']['kind']}},'then':v} for v in MATH_IR_VARIANTS]}
