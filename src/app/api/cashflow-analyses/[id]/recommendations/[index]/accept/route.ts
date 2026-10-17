import { acceptCashflowRecommendation } from "@/server/cashflow-analysis";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function POST(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await context.params;
    return Response.json(await acceptCashflowRecommendation(getWorkspaceId(request), id, Number(index)), { status: 201 });
  } catch (error) { return apiError(error); }
}
