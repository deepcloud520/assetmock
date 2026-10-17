import { createDemoWorkspace } from '../src/server/demo';
import { db } from '../src/lib/db';
async function main() {
  // Reuse a complete demo only. Never reset or overwrite existing financial data.
  const demos = await db.workspace.findMany({where:{id:{startsWith:'demo-'}},select:{id:true},orderBy:{createdAt:'asc'}});
  for(const demo of demos) {
    const accounts=await db.paperAccount.count({where:{workspaceId:demo.id,mode:'REPLAY'}});
    const experiments=await db.paperStrategyExperiment.count({where:{workspaceId:demo.id}});
    if(accounts>=2&&experiments>0) { console.log(JSON.stringify({id:demo.id,created:false}));return; }
  }
  const demo=await createDemoWorkspace();console.log(JSON.stringify({id:demo.id,created:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
