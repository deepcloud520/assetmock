import { apiError, getWorkspaceId } from "@/server/portfolio";
import { deleteTransaction, updateTransaction } from "@/server/transactions";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(await updateTransaction(getWorkspaceId(request), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(await deleteTransaction(getWorkspaceId(request), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
