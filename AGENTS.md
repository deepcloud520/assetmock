# 项目协作约定

## Git 分支与 PR

- `dev` 为开发集成分支，`main` 为审核通过后的稳定分支。
- 后续功能和修复从 `dev` 创建独立分支，PR 默认目标为 `dev`。
- 开发内容集成后，通过 `dev` → `main` 的 PR 进行审核，审核通过后再合并。
- 不直接向 `main` 推送开发改动，不跳过审核。
- 首次连接远程时先检查远程分支和历史，不强制推送覆盖远程内容。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
