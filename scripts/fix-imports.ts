import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

async function main() {
  console.log('开始修复导入路径...');
  
  // 查找所有API路由文件
  const files = await glob('app/api/**/*.ts');
  
  let fixedCount = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // 查找旧的导入方式
    if (content.includes("import { authOptions } from") && 
        content.includes("[...nextauth]/route")) {
      
      // 计算相对路径
      const fileDir = path.dirname(file);
      const authOptionsPath = path.relative(fileDir, 'app/api/auth/options').replace(/\\/g, '/');
      
      // 替换导入语句
      const newContent = content.replace(
        /import\s+{\s*authOptions\s*}\s*from\s*['"].*\[\.\.\.nextauth\]\/route['"];?/,
        `import { authOptions } from '${authOptionsPath.startsWith('.') ? authOptionsPath : './' + authOptionsPath}';`
      );
      
      if (newContent !== content) {
        fs.writeFileSync(file, newContent);
        console.log(`已修复: ${file}`);
        fixedCount++;
      }
    }
  }
  
  console.log(`完成!已修复 ${fixedCount} 个文件.`);
}

main().catch(console.error); 