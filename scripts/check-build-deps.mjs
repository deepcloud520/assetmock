import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const major = Number(process.versions.node.split('.')[0]);
if (major < 22 || major >= 25) {
  console.error(`当前 Node.js ${process.versions.node} 不在支持范围内，请使用 Node.js 22 LTS。`);
  process.exit(1);
}

const required = ['next', 'typescript', 'prisma', 'tailwindcss', '@tailwindcss/postcss'];
const missing = required.filter(name => {
  try {
    require.resolve(name === '@tailwindcss/postcss' ? name : `${name}/package.json`);
    // Also check the PostCSS plugin's native/transitive dependencies before Next starts.
    if (name === '@tailwindcss/postcss') require(name);
    return false;
  } catch {
    return true;
  }
});

if (missing.length) {
  console.error(`构建依赖缺失或无法加载：${missing.join(', ')}`);
  console.error('请先停止开发服务，在项目目录运行 npm run repair:install，再重新启动。');
  console.error('修复命令会按锁文件完整安装依赖并清理 .next 缓存，不修改 .env.local 或数据库。');
  process.exit(1);
}
console.log('构建依赖检查通过。');
