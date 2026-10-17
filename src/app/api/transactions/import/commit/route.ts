import { commitTransactionImport } from "@/server/transaction-import";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function POST(request: Request) {
  try {
    return Response.json(await commitTransactionImport(getWorkspaceId(request), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
