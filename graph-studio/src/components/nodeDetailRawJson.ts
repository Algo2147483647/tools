import type { NodeKey } from "../graph/types";
import type { FieldMapping } from "../graph/fieldMapping";
import { isRecord, validateNodeFields, validateNodeKey } from "../graph/normalize";

export function buildRawNodeEditorValue(nodeKey: NodeKey, node: Record<string, unknown>, _mapping: FieldMapping): string {
  const fields = { ...node };
  delete fields.key;
  return JSON.stringify({ id: nodeKey, data: fields }, null, 2);
}
export function parseRawNodeEditorValue(rawValue: string, _fallbackKey: NodeKey, _mapping: FieldMapping): {ok:true;nextKey:NodeKey;fields:Record<string,unknown>}|{ok:false;message:string} {
  try {
    const parsed:unknown=JSON.parse(rawValue);
    if (!isRecord(parsed) || Object.keys(parsed).some(key=>!["id","data"].includes(key))) throw new Error('Expected { "id": "node-id", "data": { ... } }.');
    validateNodeKey(parsed.id);
    validateNodeFields(parsed.data,"/data");
    return {ok:true,nextKey:parsed.id,fields:parsed.data};
  } catch(error) {return {ok:false,message:error instanceof Error?error.message:"Invalid node JSON."};}
}
