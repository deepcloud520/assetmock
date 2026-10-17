'use client';
import {useState} from 'react';
export function DemoSwitch({workspaceId}:{workspaceId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function create(){setBusy(true);try{const r=await fetch('/api/demo',{method:'POST'}),v=await r.json();if(!r.ok)throw new Error(v.error);if(!workspaceId.startsWith('demo-'))localStorage.setItem('financial_previous_workspace',workspaceId);localStorage.setItem('financial_associate_workspace_id',v.id);window.location.reload();}catch(e){setError(e instanceof Error?e.message:'演示初始化失败');setBusy(false);}}
 async function restore(){setBusy(true);try{let id=localStorage.getItem('financial_previous_workspace');if(!id){const r=await fetch('/api/workspaces',{method:'POST'});if(!r.ok)throw new Error('无法创建个人空间');id=(await r.json()).id;}localStorage.setItem('financial_associate_workspace_id',id!);window.location.reload();}catch(e){setError(e instanceof Error?e.message:'切换失败');setBusy(false);}}
 return <div className="demo-switch"><button className="button-secondary" disabled={busy} onClick={()=>void create()}>{busy?'创建演示空间…':workspaceId.startsWith('demo-')?'重置为新演示空间':'进入独立演示空间'}</button>{workspaceId.startsWith('demo-')&&<><strong>演示数据 · 非真实财务／行情</strong><button className="button-secondary" disabled={busy} onClick={()=>void restore()}>进入个人空间</button></>}{error&&<span role="alert">{error}</span>}</div>;
}
