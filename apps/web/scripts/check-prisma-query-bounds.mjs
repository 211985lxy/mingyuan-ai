import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

export function findUnboundedFindMany(source, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const violations = []

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "findMany"
    ) {
      const options = node.arguments[0]
      const hasTake = Boolean(
        options
        && ts.isObjectLiteralExpression(options)
        && options.properties.some((property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
          && property.name?.getText(sourceFile) === "take",
        ),
      )
      if (!hasTake) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({ line: location.line + 1, expression: node.expression.expression.getText(sourceFile) })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function listSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) listSourceFiles(path, files)
    else if ([".ts", ".tsx"].includes(extname(path))) files.push(path)
  }
  return files
}

export function checkPrismaQueryBounds(root = resolve(webRoot, "src")) {
  const violations = []
  for (const file of listSourceFiles(root)) {
    const source = readFileSync(file, "utf8")
    for (const violation of findUnboundedFindMany(source, file)) {
      violations.push(`${relative(webRoot, file)}:${violation.line} ${violation.expression}.findMany`)
    }
  }
  return violations
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const violations = checkPrismaQueryBounds()
  if (violations.length > 0) {
    console.error("Unbounded Prisma findMany calls:")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }
  console.log("prisma-query-bounds-ok")
}
