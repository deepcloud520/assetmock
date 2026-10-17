import { commitFinancialImport } from "@/server/financial-import";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function POST(request: Request) {
  try {
    return Response.json(await commitFinancialImport(getWorkspaceId(request), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
