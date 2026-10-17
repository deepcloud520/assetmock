import { apiError, getWorkspaceId } from "@/server/portfolio";
import { classifyTransaction } from "@/server/transaction-classification";
import { createTransaction, listTransactions } from "@/server/transactions";

export async function GET(request: Request) {
  try {
    return Response.json(await listTransactions(getWorkspaceId(request), new URL(request.url).searchParams));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json(await createTransaction(getWorkspaceId(request), await request.json(), classifyTransaction), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
