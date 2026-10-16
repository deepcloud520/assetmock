import {loadEnvConfig} from '@next/env';
import assert from 'node:assert/strict';
loadEnvConfig(process.cwd());
async function main(){
 const {createDemoWorkspace}=await import('../src/server/demo');
 const {db}=await import('../src/lib/db');
 const {createAgentSession,startAgentMessage,executeAgentRun}=await import('../src/server/five-agent-runtime');
 const d=await createDemoWorkspace();console.log('Created independent demo workspace for real model check');
 const session=await createAgentSession(d.id,{agentKey:'WEALTH'});
 const run=await startAgentMessage(d.id,session.id,{clientMessageId:crypto.randomUUID(),content:'请读取我的财务事实，说明现有现金、基金和保护资金；只核对，不修改任何资料。'});
 console.log('Calling wealth manager model with read-only task');
 await executeAgentRun(d.id,run.id);
 const result=await db.agentRun.findUniqueOrThrow({where:{id:run.id}});
 const messages=await db.agentMessage.findMany({where:{runId:run.id,role:'ASSISTANT'}});
 console.log(JSON.stringify({status:result.status,errorCode:result.errorCode,messages:messages.map(m=>m.content)}));
 assert.equal(result.status,'COMPLETED');assert.ok(messages.length);
 const {openingDraft,confirmOpening,frozenOpening}=await import('../src/server/simulations/opening');
 const {prepare}=await import('../src/server/v2/ai');
 const source=await openingDraft(d.id,null);
 const o=await confirmOpening(d.id,'live-integration',{...source.values,age:30,target:'home',goalId:null,sourceSignature:source.sourceSignature,confirmed:true,acknowledgeRestrictions:true});
 const frozen=await frozenOpening(o.id,d.id,'live-integration');
 console.log('Calling goal preparation with confirmed ledger snapshot');
 const proposal=await prepare('home',o.profile.id,'我想买100万元的房子，贷款30年，比较30%和50%首付。','live-integration',frozen);
 console.log(JSON.stringify({source:proposal.source,trace:proposal.trace,target:proposal.input.target,profileMatches:proposal.input.profileId===o.profile.id}));
 assert.equal(proposal.source,'model');assert.equal(proposal.input.profileId,o.profile.id);
 await db.$disconnect();
}
main().catch(e=>{console.error(e instanceof Error?e.message:'live integrated failed');process.exitCode=1;});
