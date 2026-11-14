declare module 'markdown-it-texmath' {import type {PluginWithOptions} from 'markdown-it';const plugin:PluginWithOptions<Record<string,unknown>>;export = plugin;}

declare module '*.css';
declare module '@toast-ui/editor' {export default class Editor {constructor(options:Record<string,unknown>);getMarkdown():string;setMarkdown(text:string):void;destroy():void;focus():void;on(event:string,callback:()=>void):void;moveCursorToEnd():void;insertText(text:string):void;}}
