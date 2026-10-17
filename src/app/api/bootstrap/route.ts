import { db } from '@/lib/db';
import { assertLocal } from '@/server/local-data-access';
import { apiError } from '@/server/portfolio';
// Only the first browser visit uses the starter demo. Existing localStorage wins.
export async function GET(request:Request) {
  try {
    assertLocal(request);
    const id=process.env.STARTER_DEMO_WORKSPACE_ID;
    const workspace=id?await db.workspace.findFirst({where:{id:{equals:id,startsWith:'demo-'}},select:{id:true}}):null;
    return Response.json({demoWorkspaceId:workspace?.id??null});
  } catch(error) { return apiError(error); }
}
