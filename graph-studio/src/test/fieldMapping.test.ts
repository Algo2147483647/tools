import assert from "node:assert/strict";
import { getDefaultFieldMapping, inferFieldMapping, sanitizeFieldMapping, validateFieldMapping } from "../graph/fieldMapping";
import { defineSuite, defineTest } from "./harness";
export const fieldMappingSuite=defineSuite("native field roles",[
 defineTest("v2 does not infer aliases or restore legacy mappings",()=>{
   const mapping=getDefaultFieldMapping();
   assert.deepEqual(inferFieldMapping({A:{next:{B:"x"}}}),mapping);
   assert.deepEqual(sanitizeFieldMapping({children:"next"}),mapping);
   assert.equal(validateFieldMapping({...mapping,children:"next"}).ok,false);
 }),
]);
