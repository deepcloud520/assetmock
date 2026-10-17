import { extractTransactionsFromImages, extractTransactionsFromText } from "@/server/transaction-import";
import { apiError, assertWorkspace, getWorkspaceId } from "@/server/portfolio";

export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceId(request);
    await assertWorkspace(workspaceId);
    const form = await request.formData();
    const mode = form.get("mode");
    if (mode === "TEXT") return Response.json(await extractTransactionsFromText(form.get("text"), workspaceId));
    if (mode === "IMAGE") return Response.json(await extractTransactionsFromImages(form.getAll("images").filter((value): value is File => value instanceof File), workspaceId));
    return Response.json({ error: "请选择文字或图片识别" }, { status: 422 });
  } catch (error) {
    return apiError(error);
  }
}
