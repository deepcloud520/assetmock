import { executeAgentRun, type AgentEvent } from "./five-agent-runtime";
export function agentEventStream(workspaceId:string,runId:string,requestSignal:AbortSignal){
 const encoder=new TextEncoder();const controller=new AbortController();let closed=false;
 const stream=new ReadableStream<Uint8Array>({
  async start(s){
   const emit=(event:AgentEvent)=>{if(!closed)s.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));};
   try{const result=await executeAgentRun(workspaceId,runId,emit,{signal:AbortSignal.any([requestSignal,controller.signal])});emit({type:"result",runId,result});}
   catch{emit({type:"error",runId,message:"本次处理未完成，请重新读取会话。"});}
   finally{if(!closed){closed=true;s.close();}}
  },cancel(){closed=true;controller.abort();},
 });
 return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store","X-Accel-Buffering":"no"}});
}
