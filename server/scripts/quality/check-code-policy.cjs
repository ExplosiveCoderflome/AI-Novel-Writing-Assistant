const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function inspectSource(source, filename = "source.ts") {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  function report(node, rule) {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.push(`${filename}:${line + 1} ${rule}`);
  }
  function visit(node) {
    if (ts.isDebuggerStatement(node)) report(node, "禁止提交 debugger 语句");
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Promise") {
      const executor = node.arguments?.[0];
      if (executor && (ts.isArrowFunction(executor) || ts.isFunctionExpression(executor))
        && executor.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
        report(node, "Promise executor 不能是 async；其拒绝不会传给外层 Promise");
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval") {
      report(node, "禁止动态 eval");
    }
    if (ts.isThrowStatement(node) && ts.isStringLiteral(node.expression)) {
      report(node, "请抛出 Error 以保留异常栈");
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  // Scan comment tokens rather than strings containing examples.
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(kind)
      && /@ts-(?:ignore|nocheck)\b/.test(scanner.getTokenText())) {
      const { line } = file.getLineAndCharacterOfPosition(scanner.getTokenPos());
      violations.push(`${filename}:${line + 1} 不允许关闭类型检查，请修正类型或使用有说明的 @ts-expect-error`);
    }
  }
  return violations;
}

function listSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? listSources(filename) : filename.endsWith(".ts") ? [filename] : [];
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, "../../src");
  const files = listSources(root);
  const errors = files.flatMap((file) => inspectSource(fs.readFileSync(file, "utf8"), path.relative(root, file)));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Server code policy passed (${files.length} TypeScript files).`);
  }
}

module.exports = { inspectSource };
