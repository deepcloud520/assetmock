import { z } from "zod";
import { apiError, getWorkspaceId } from "@/server/portfolio";
import { listPromptSettings, promptKeys, savePromptOverride } from "@/server/prompt-settings";

const updateSchema = z.object({
  key: z.enum(promptKeys),
  prompt: z.string().min(1).max(20_000).nullable(),
});

export async function GET(request: Request) {
  try {
    return Response.json(await listPromptSettings(getWorkspaceId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { key, prompt } = updateSchema.parse(await request.json());
    return Response.json(await savePromptOverride(getWorkspaceId(request), key, prompt));
  } catch (error) {
    return apiError(error);
  }
}
