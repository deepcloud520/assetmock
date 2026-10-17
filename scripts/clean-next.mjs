import { rmSync } from 'node:fs';

// A fixed project-relative path: never accept an arbitrary directory to remove.
rmSync(new URL('../.next/', import.meta.url), { recursive: true, force: true });
console.log('已清理 .next 构建缓存。');
