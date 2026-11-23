import { type ClaudeModUiState, EMPTY_CLAUDE_MOD_UI_STATE } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { ClaudeModsPanelView } from "./ClaudeModsPanel";

const STATE: ClaudeModUiState = {
  ...EMPTY_CLAUDE_MOD_UI_STATE,
  panes: [
    { id: "todos", title: "Todos", plugin: "todo" },
    { id: "clock", title: "Clock", plugin: "clock" },
  ],
  shownId: "todos",
  trees: {
    todos: {
      type: "Button",
      props: { key: "clear", label: "Clear done" },
      press: { plugin: "todo", handle: 3 },
    },
    clock: { type: "Text", children: ["12:00"] },
  },
  statuses: [{ plugin: "clock", text: "Synced" }],
};

it("shows a pane per tab, switches and closes panes, and acts on the shown pane", async () => {
  const onAction = vi.fn();
  await using screen = await render(
    <ClaudeModsPanelView threadKey="env:thread-a" state={STATE} canAct onAction={onAction} />,
  );

  await expect
    .element(screen.getByRole("tab", { name: "Todos" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByText("Synced")).toBeVisible();

  await screen.getByRole("button", { name: "Clear done" }).click();
  expect(onAction).toHaveBeenLastCalledWith({
    type: "press",
    paneId: "todos",
    press: { plugin: "todo", handle: 3 },
    key: "clear",
  });

  await screen.getByRole("tab", { name: "Clock" }).click();
  expect(onAction).toHaveBeenLastCalledWith({ type: "show", paneId: "clock" });
  await expect.element(screen.getByText("12:00")).toBeVisible();

  await screen.getByRole("button", { name: "Close Clock" }).click();
  expect(onAction).toHaveBeenLastCalledWith({ type: "close", paneId: "clock" });
});

it("explains how to get panes when the thread has none", async () => {
  await using screen = await render(
    <ClaudeModsPanelView
      threadKey="env:thread-b"
      state={EMPTY_CLAUDE_MOD_UI_STATE}
      canAct
      onAction={() => undefined}
    />,
  );
  await expect.element(screen.getByText("No mod panes open in this thread")).toBeVisible();
});
