import { getCashflowAnalysis, runCashflowAnalysis } from "@/server/cashflow-analysis";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    return Response.json(await getCashflowAnalysis(getWorkspaceId(request), new URL(request.url).searchParams));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    return Response.json(await runCashflowAnalysis(getWorkspaceId(request), await request.json()), { status: 201 });
  } catch (error) { return apiError(error); }
}
