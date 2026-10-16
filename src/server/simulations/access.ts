import { NextRequest } from 'next/server';
import { endpoint } from '../http';
import { db } from '@/lib/db';
import { ServiceError } from '../store';
import { assertLocal } from '../local-data-access';
import { toPublic } from '@/domain/v2/presentation';
import type { Run } from '@/domain/v2/types';
import { openingDraft } from './opening';
export type Context = { workspaceId:string; sessionId:string };
export function simulationEndpoint(handler:(req:NextRequest,owner:string,context:Context)=>Promise<unknown>){
 return endpoint(async(req,sessionId)=>{
  try { assertLocal(req); } catch { throw new ServiceError(403,"新情景推演仅允许本机同源访问"); }
  const workspaceId=req.headers.get('X-Workspace-Id');
  if(!workspaceId||!await db.workspace.findUnique({where:{id:workspaceId}}))throw new ServiceError(404,'工作区不存在');
  return handler(req,`integrated:${workspaceId}:${sessionId}`,{workspaceId,sessionId});
 });
}
export async function indexRun(run:Run,c:Context){
 await db.simulationReport.upsert({where:{runId:run.id},create:{runId:run.id,...c,goalId:run.setup.source?.goalId,sourceJson:JSON.stringify(run.setup.source??{})},update:{}});
}
export async function saveReport(run:Run,c:Context){
 await indexRun(run,c);
 const report={run:toPublic(run),inputSnapshot:run.setup,source:run.setup.source,savedAt:new Date().toISOString(),notice:'推演报告；不代表真实交易或收益，也不会修改财务底账。'};
 await db.simulationReport.updateMany({where:{runId:run.id,...c,version:{lt:run.version}},data:{version:run.version,reportJson:JSON.stringify(report)}});
 return {saved:true,runId:run.id,version:run.version};
}
export async function listReports(c:Context){
 const rows=await db.simulationReport.findMany({where:c,orderBy:{updatedAt:'desc'},take:50});
 return Promise.all(rows.map(async r=>{
  const source=JSON.parse(r.sourceJson); let stale=false;
  if(source.kind==='ledger') {try{stale=(await openingDraft(c.workspaceId,source.goalId)).sourceSignature!==source.signature;}catch{stale=true;}}
  return {runId:r.runId,version:r.version,goalId:r.goalId,source,stale,report:r.reportJson?JSON.parse(r.reportJson):null,updatedAt:r.updatedAt};
 }));
}
