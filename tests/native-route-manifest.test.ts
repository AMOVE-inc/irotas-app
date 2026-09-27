import { describe, expect, it } from "vitest";
import requireContext from "expo-router/build/testing-library/require-context-ponyfill";
import { getRoutes } from "expo-router/build/getRoutes";
import { getReactNavigationConfig } from "expo-router/build/getReactNavigationConfig";
import type { RouteNode } from "expo-router/build/Route";

function findRoute(node: RouteNode | null, route: string): RouteNode | undefined {
  if (!node) return undefined;
  if (node.route === route) return node;
  for (const child of node.children ?? []) {
    const match = findRoute(child, route);
    if (match) return match;
  }
  return undefined;
}

describe("native Expo Router manifest", () => {
  it("registers chat as a stack with both compatibility and room routes", () => {
    const context = requireContext("./app", true, /\.[tj]sx?$/);
    const routes = getRoutes(context, {
      ignoreRequireErrors: true,
      importMode: "async",
    });
    const chat = findRoute(routes, "chat");

    expect(chat?.type).toBe("layout");
    expect(chat?.contextKey).toBe("./chat/_layout.tsx");
    expect(chat?.children.map((child) => child.route).sort()).toEqual(["[id]", "index"]);
    expect(chat?.children.find((child) => child.route === "[id]")?.dynamic).toEqual([
      { name: "id", deep: false },
    ]);

    const config = getReactNavigationConfig(routes!, true) as any;
    expect(config.screens.chat).toEqual({
      path: "chat",
      screens: { "[id]": ":id", index: "" },
    });
    expect(config.screens["(tabs)"].screens.board).toBe("board");
  });
});
