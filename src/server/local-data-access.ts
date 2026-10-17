import { ApiError } from "./portfolio";
export function assertLocal(request: Request) {
  const url = new URL(request.url);
  // Next's Node adapter can canonicalize request.url to localhost while the browser
  // uses 127.0.0.1. Compare Origin with the actual, independently validated Host.
  const publicUrl = new URL(`${url.protocol}//${request.headers.get("host") ?? url.host}`);
  const local = ["127.0.0.1", "localhost", "[::1]"];
  if (!local.includes(url.hostname) || !local.includes(publicUrl.hostname)) throw new ApiError("本地数据管理仅允许从本机访问", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== publicUrl.origin) throw new ApiError("数据管理不接受跨站请求", 403);
}
