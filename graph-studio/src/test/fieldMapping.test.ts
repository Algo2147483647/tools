import assert from "node:assert/strict";
import { getDefaultFieldMapping, sanitizeFieldMapping } from "../graph/fieldMapping";
import { defineSuite, defineTest } from "./harness";
export const fieldMappingSuite=defineSuite("native field roles",[
 defineTest("v2 restores fixed semantic fields instead of legacy mappings",()=>{
   const mapping=getDefaultFieldMapping();
   assert.deepEqual(mapping,{children:"children",parents:"parents",define:"define",title:"title",type:"type"});
   assert.deepEqual(sanitizeFieldMapping({children:"next"}),mapping);
 }),
]);
