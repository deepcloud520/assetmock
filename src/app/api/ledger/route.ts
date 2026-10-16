import { apiError, getWorkspaceId, saveLedgerBatch, serialize } from "@/server/portfolio";

export async function PUT(request: Request) {
  try {
    const result = await saveLedgerBatch(getWorkspaceId(request), await request.json());
    return Response.json(serialize(result));
  } catch (error) {
    return apiError(error);
  }
}
