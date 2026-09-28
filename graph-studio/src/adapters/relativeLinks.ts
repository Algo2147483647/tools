import type { WorkspaceFile } from "../workspace/types";
import { readWorkspaceFile } from "../workspace/discovery";
import { linkPath } from "../workspace/paths";

export interface RelativeLinkRoot {
  name: string;
  handle: FileSystemDirectoryHandle | null;
  files: Map<string, WorkspaceFile>;
  baseFile: string;
}
export interface ResolvedRelativeFile {
  originalUrl: string;
  path: string;
  relativePath: string;
  file: File;
  url: string;
  previewKind: FilePreviewKind;
}
export type FilePreviewKind = "markdown" | "html" | "image" | "text" | "unsupported";
export function isExternalUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value) || /^(?:mailto|tel|data|blob):/i.test(value);
}
export function isRelativeLink(value: string): boolean {
  const text=value.trim();
  return Boolean(text) && !text.startsWith("#") && !text.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(text);
}
export function resolveRelativePath(value: string, baseFile = ""): {ok:true;path:string}|{ok:false;message:string} {
  try { return {ok:true,path:linkPath(value,baseFile)}; }
  catch(error){return {ok:false,message:error instanceof Error?error.message:String(error)};}
}
export async function resolveRelativeFile(root: RelativeLinkRoot | null, originalUrl: string): Promise<{ok:true;file:ResolvedRelativeFile}|{ok:false;message:string}> {
  if (!root) return {ok:false,message:"Open a workspace to access linked files. Single-file mode has no access to neighboring files."};
  const resolved=resolveRelativePath(originalUrl,root.baseFile);
  if(!resolved.ok)return {ok:false,message:resolved.message};
  const entry=root.files.get(resolved.path);
  if(!entry)return {ok:false,message:`File not found in this workspace: ${resolved.path}`};
  try {
    const file=await readWorkspaceFile(entry);
    return {ok:true,file:{originalUrl,path:`${root.name}/${resolved.path}`,relativePath:resolved.path,file,url:URL.createObjectURL(file),previewKind:getFilePreviewKind(file.name,file.type)}};
  } catch(error) {return {ok:false,message:`Unable to open ${resolved.path}: ${error instanceof Error?error.message:String(error)}`};}
}
export function getFilePreviewKind(fileName: string,mimeType=""):FilePreviewKind {
  if(mimeType.startsWith("image/") || /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(fileName))return "image";
  if(/\.md(?:own)?$/i.test(fileName))return "markdown";
  if(mimeType==="text/html" || /\.html?$/i.test(fileName))return "html";
  if(mimeType.startsWith("text/") || /\.(?:txt|csv|tsv|json|xml|yaml|yml|log|css|js|ts|tsx|jsx)$/i.test(fileName))return "text";
  return "unsupported";
}
