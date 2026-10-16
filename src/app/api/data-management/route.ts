import { apiError, getWorkspaceId } from "@/server/portfolio";
import { dataCommand, dataOverview } from "@/server/data-management";
import { assertLocal } from "@/server/local-data-access";
export const runtime = "nodejs";

export async function GET(request: Request) { try { assertLocal(request); return Response.json(await dataOverview(getWorkspaceId(request))); } catch (e) { return apiError(e); } }
export async function POST(request: Request) { try { assertLocal(request); return Response.json(await dataCommand(getWorkspaceId(request), await request.json())); } catch (e) { return apiError(e); } }
