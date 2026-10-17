import { createResource, deleteResource, getWorkspaceId, updateResource, apiError, serialize } from "./portfolio";
import type { ResourceKind } from "@/domain/portfolio";

export function collectionPost(kind: ResourceKind) {
  return async (request: Request) => {
    try {
      const item = await createResource(kind, getWorkspaceId(request), await request.json());
      return Response.json(serialize(item), { status: 201 });
    } catch (error) {
      return apiError(error);
    }
  };
}

export function itemPut(kind: ResourceKind) {
  return async (request: Request, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const item = await updateResource(kind, getWorkspaceId(request), id, await request.json());
      return Response.json(serialize(item));
    } catch (error) {
      return apiError(error);
    }
  };
}

export function itemDelete(kind: ResourceKind) {
  return async (request: Request, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      await deleteResource(kind, getWorkspaceId(request), id);
      return new Response(null, { status: 204 });
    } catch (error) {
      return apiError(error);
    }
  };
}
