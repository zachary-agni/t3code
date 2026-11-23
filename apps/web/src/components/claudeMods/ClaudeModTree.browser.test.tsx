import type { ClaudeModNode } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ClaudeModTree, svgDataUrl } from "./ClaudeModTree";

const press = (handle: number) => ({ plugin: "todo", handle });

it("draws a mod's tree and sends presses, submits and link clicks with their handles", async () => {
  const onAction = vi.fn();
  const tree: ClaudeModNode = {
    type: "Box",
    props: { flexDirection: "column", gap: 1, borderStyle: "round" },
    children: [
      { type: "Text", props: { color: "success", weight: "bold" }, children: ["All done"] },
      "plain child",
      { type: "Button", props: { key: "refresh", label: "Refresh" }, press: press(7) },
      {
        type: "Input",
        props: { key: "task", placeholder: "New task", submitLabel: "Add" },
        press: press(8),
      },
      {
        type: "Markdown",
        props: { text: "See [docs](https://example.com/docs)" },
        press: press(9),
      },
      { type: "Svg", props: { source: "<svg><script>alert(1)</script></svg>", alt: "Chart" } },
      { type: "Client", props: { key: "c", module: "x" } },
      { type: "Shader", children: [{ type: "Text", children: ["shader child"] }] },
      { type: "engine", ref: 0 } as unknown as ClaudeModNode,
    ],
  };
  await using screen = await render(<ClaudeModTree tree={tree} canAct onAction={onAction} />);

  await expect.element(screen.getByText("All done")).toBeVisible();
  // A bare string child sits beside its siblings without an element of its own.
  expect(screen.container.textContent).toContain("plain child");
  await expect.element(screen.getByText("shader child")).toBeVisible();
  await expect.element(screen.getByText("Not supported in T3 Code")).toBeVisible();

  await screen.getByRole("button", { name: "Refresh" }).click();
  expect(onAction).toHaveBeenLastCalledWith({ type: "press", press: press(7), key: "refresh" });

  await userEvent.type(screen.getByPlaceholder("New task"), "Buy milk{Enter}");
  expect(onAction).toHaveBeenLastCalledWith({
    type: "input",
    press: press(8),
    key: "task",
    kind: "submit",
    value: "Buy milk",
  });

  await screen.getByRole("link", { name: "docs" }).click();
  expect(onAction).toHaveBeenLastCalledWith({
    type: "press",
    press: press(9),
    href: "https://example.com/docs",
  });

  // Mod SVG is an image source only, so its script never runs as part of the page.
  const image = screen.getByRole("img", { name: "Chart" });
  await expect
    .element(image)
    .toHaveAttribute("src", svgDataUrl("<svg><script>alert(1)</script></svg>"));
  expect(screen.container.querySelector("script")).toBeNull();
});

it("disables a mod's controls without the permission to act", async () => {
  const onAction = vi.fn();
  await using screen = await render(
    <ClaudeModTree
      tree={{ type: "Button", props: { key: "go", label: "Go" }, press: press(1) }}
      canAct={false}
      onAction={onAction}
    />,
  );
  await expect.element(screen.getByRole("button", { name: "Go" })).toBeDisabled();
});
