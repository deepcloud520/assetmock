import { assertLocal } from '@/server/local-data-access';
import { apiError } from '@/server/portfolio';
import { createDemoWorkspace } from '@/server/demo';
export const runtime='nodejs';
export async function POST(request:Request){try{assertLocal(request);return Response.json(await createDemoWorkspace());}catch(e){return apiError(e);}}
