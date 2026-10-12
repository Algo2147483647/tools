import { spawnSync } from 'node:child_process';
import { platform, release } from 'node:os';
const names=['git','gcc','make','cmake','docker'];
const commands=Object.fromEntries(names.map(name=>{const result=spawnSync(name,['--version'],{encoding:'utf8',timeout:5000,windowsHide:true});
  return [name,{available:!result.error&&result.status===0,detail:result.error?.message??(result.stdout||result.stderr).split('\n')[0]}];}));
let wsl=null;
if(platform()==='win32'){
  const result=spawnSync('wsl.exe',['--list','--quiet'],{timeout:5000,windowsHide:true});
  const stdout=result.stdout?.toString('utf16le').replaceAll('\0','').trim()??'';
  const stderr=result.stderr?.toString('utf16le').replaceAll('\0','').trim()??'';
  wsl={exitCode:result.status,distributions:result.status===0?stdout.split(/\r?\n/).filter(Boolean):[],detail:stdout||stderr||result.error?.message};
}
console.log(JSON.stringify({platform:platform(),release:release(),node:process.version,commands,wsl,
  firmwareExecuted:false,requirement:'Betaflight requires a POSIX GCC/make toolchain. PX4 requires its supported Linux development environment. No OS or toolchain is installed by this diagnostic.'},null,2));
