import { apiError, assertWorkspace, getWorkspaceId } from "@/server/portfolio";
import { productCommand } from "@/server/product-management";
import { assertLocal } from "@/server/local-data-access";
export const runtime = "nodejs";
export async function POST(request: Request) { try { assertLocal(request); await assertWorkspace(getWorkspaceId(request)); return Response.json(await productCommand(await request.json())); } catch (e) { return apiError(e); } }
