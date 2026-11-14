const esbuild=require('../desktop/node_modules/esbuild');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../desktop');
const entries=['main.ts',...['application','platform','shared','ai','tools'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(name=>name.endsWith('.ts')&&!name.endsWith('.d.ts')).map(name=>dir+'/'+name)),'renderer/markdown.ts','renderer/live-math.ts'];
async function build(){
 require('node:child_process').execFileSync(path.resolve(root,'../.runtime/python-engine/python.exe'),[path.resolve(root,'../scripts/Generate-MathContracts.py')],{stdio:'inherit'});
 const buildRoot=path.resolve(root,'build'),target=path.resolve(buildRoot,'backend');
 if(!target.startsWith(root+path.sep)||path.dirname(target)!==buildRoot)throw Error('Unexpected generated output path');
 if(fs.existsSync(buildRoot)&&fs.realpathSync(buildRoot)!==buildRoot)throw Error('Refusing linked build output');
 if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink())throw Error('Refusing linked backend output');fs.rmSync(target,{recursive:true,force:true});}

 await esbuild.build({absWorkingDir:root,entryPoints:entries,outdir:'build/backend',outbase:'.',platform:'node',format:'cjs',target:'node24',packages:'external',sourcemap:true});
 await esbuild.build({absWorkingDir:root,entryPoints:['preload.ts'],outfile:'build/backend/preload.js',bundle:true,platform:'node',format:'cjs',external:['electron'],target:'node24'});
 await esbuild.build({absWorkingDir:root,entryPoints:['renderer/editor.ts'],bundle:true,outfile:'renderer/editor.bundle.js',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},assetNames:'fonts/[name]-[hash]'});
 await esbuild.build({absWorkingDir:root,entryPoints:['renderer/app.tsx'],bundle:true,minify:true,define:{'process.env.NODE_ENV':'"production"'},outfile:'renderer/app.bundle.js'});
 console.log('Built TypeScript main, preload, workers and React renderer.');
}
build().catch(error=>{console.error(error);process.exitCode=1});
