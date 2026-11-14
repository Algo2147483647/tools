const { randomUUID, createHash } = require('node:crypto');
function parseDelimited(text, delimiter) {
  const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c==='"'&&!field&&!closed)quoted=true;
    else if(c===delimiter){row.push(field);field='';closed=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.length>1||row.some(x=>x!=='')||closed)rows.push(row);row=[];field='';closed=false;}
    else{if(closed)throw Error('Unexpected text after a quoted CSV field.');field+=c;}
    if(rows.length>50001||row.length>100||field.length>10000)throw Error('Dataset exceeds row, column or cell limits.');
  }
  if(quoted)throw Error('CSV contains an unclosed quoted field.');
  row.push(field);if(row.length>1||row.some(x=>x!=='')||closed)rows.push(row);
  return rows;
}
class DatasetStore {
  constructor(){this.entries=new Map();this.bytes=0;}
  import(name,text) {
    const bytes=Buffer.byteLength(text);if(bytes>2*1024*1024||this.bytes+bytes>16*1024*1024||this.entries.size>=16)throw Error('Dataset storage limit reached (2 MB/file, 16 MB/session).');
    const raw=parseDelimited(text.replace(/^\uFEFF/,''),/\.tsv$/i.test(name)?'\t':',');
    if(raw.length<2)throw Error('Dataset needs a header and at least one data row.');
    const columns=raw.shift().map(x=>x.trim());
    if(columns.some(x=>!x||x.length>100)||new Set(columns).size!==columns.length||columns.length>100)throw Error('Column names must be nonempty, unique and at most 100 characters.');
    if(raw.length>50000||raw.some(row=>row.length!==columns.length))throw Error('Rows must match the header; maximum 50,000 rows.');
    const rows=raw.map(row=>row.map(value=>value.trim()===''?null:value));
    const descriptor={id:randomUUID(),name,rows:rows.length,columns:columns.map((name,i)=>({name,missing:rows.filter(r=>r[i]===null).length,numeric:rows.every(r=>r[i]===null||Number.isFinite(Number(r[i])))})),sha256:createHash('sha256').update(text).digest('hex'),sample:rows.slice(0,3).map(row=>row.map(v=>v===null?null:v.slice(0,120)))};
    this.entries.set(descriptor.id,{descriptor,columns,rows});this.bytes+=bytes;return structuredClone(descriptor);
  }
  get(id){const item=this.entries.get(id);if(!item)throw Error('Dataset not found. Import and attach it first.');return item;}
  describe(ids){return ids.map(id=>structuredClone(this.get(id).descriptor));}
  clear(){this.entries.clear();this.bytes=0;}
}
module.exports={DatasetStore,parseDelimited};
