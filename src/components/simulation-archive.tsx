'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
export function SimulationArchive(){
 const [records,setRecords]=useState<{name:string;data:string}[]>([]);
 useEffect(()=>{const rows:{name:string;data:string}[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('financial_associate_simulation_')){const raw=localStorage.getItem(key);if(raw)rows.push({name:key,data:raw});}}queueMicrotask(()=>setRecords(rows));},[]);
 return <main style={{padding:32,maxWidth:1000,margin:'auto'}}><h1>旧版推演记录</h1><p>原产品浏览器存档只读展示；不会升级或改写旧规则。不同端口的浏览器存档需要在原产品中查看或导出。</p><p><Link href="/game">继续独立 v0.2 游戏</Link> · <Link href="/legacy">继续早期游戏</Link> · <Link href="/">返回资产管家</Link></p>{!records.length&&<p>当前浏览器来源下没有原产品存档。</p>}{records.map(r=><details key={r.name}><summary>{r.name}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{(()=>{try{return JSON.stringify(JSON.parse(r.data),null,2);}catch{return r.data;}})()}</pre></details>)}</main>;
}
