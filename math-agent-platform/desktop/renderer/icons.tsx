import React from 'react';
export function IconButton({icon,label,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{icon:'copy'|'download'|'close'|'clear';label:string}){
 const paths={copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>,download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,close:<path d="m6 6 12 12M18 6 6 18"/>,clear:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>};
 return <button {...props} type="button" className="icon-button" aria-label={label} title={label}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[icon]}</svg></button>;
}
