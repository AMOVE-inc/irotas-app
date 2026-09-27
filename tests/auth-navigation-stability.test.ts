import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function profileGateDependencies(source: string) {
  const file = ts.createSourceFile("app/_layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let dependencies: string[] | undefined;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)
      && node.expression.getText(file) === "useEffect"
      && node.arguments.length === 2
      && ts.isArrowFunction(node.arguments[0])
      && node.arguments[0].getText(file).includes("hasCompletedNativeProfileSetup")
      && ts.isArrayLiteralExpression(node.arguments[1])) {
      dependencies = node.arguments[1].elements.map((element) => element.getText(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return dependencies;
}

describe("native auth navigation stability", () => {
  it("does not rerun the profile gate when only the route changes", () => {
    const source = readFileSync("app/_layout.tsx", "utf8");
    const dependencies = profileGateDependencies(source);

    expect(dependencies).toBeDefined();
    expect(dependencies).not.toContain("currentRoute");
    expect(dependencies).toEqual([
      "user?.id",
      "user?.memberId",
      "user?.name",
      "user?.publicUserId",
    ]);
  });
});
