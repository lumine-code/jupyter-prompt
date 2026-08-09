const path = require("path");
const PromptPanel = require("../lib/prompt-panel");

// Activate by path, not by name: resolving the name would need this checkout
// linked into the packages directory, which is a property of whoever runs the
// suite rather than of the suite.
const PACKAGE_PATH = path.join(__dirname, "..");

describe("jupyter-prompt item actions", () => {
  let panel;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const activation = lumine.packages.activatePackage(PACKAGE_PATH);
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-prompt:toggle");
    await activation;
    panel = new PromptPanel(() => null);
  });

  afterEach(async () => {
    panel.destroy();
    await lumine.packages.deactivatePackage("jupyter-prompt");
  });

  it("offers both entry commands as actions, bound to the keys the panel documents", () => {
    const actions = panel.selectList.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const run = byCommand.get("jupyter-prompt:run-history-entry");
    expect(run.name).toBe("Run History Entry");
    expect(run.description).toBe("Run the selected entry and close the panel");
    // Enter reaches it as chrome, through core:confirm, so the keymap binds
    // nothing of its own — the row is listed without a key, like every other
    // list's confirm action.
    expect(run.keystrokes).toEqual([]);

    const recall = byCommand.get("jupyter-prompt:recall-history-entry");
    expect(recall.name).toBe("Recall History Entry");
    expect(recall.description).toBe(
      "Put the selected entry back in the prompt to edit before running it",
    );
    expect(recall.keystrokes).toEqual(["shift-enter"]);

    // Chrome and the workspace-level toggle stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("jupyter-prompt:toggle")).toBe(false);
  });

  it("leaves Enter bound to the chrome, so it still confirms inside the actions list", () => {
    // The actions list wears the panel's own classes, so a package binding on
    // Enter would follow it in and run a history entry instead of the action
    // under the cursor. The panel binds nothing on Enter for that reason.
    const bindings = lumine.keymaps.findKeyBindings({
      keystrokes: "enter",
      target: panel.selectList.refs.queryEditor.element,
    });

    expect(bindings[0].command).toBe("core:confirm");
  });

  it("runs the action against the panel's selection", async () => {
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);
    panel.selectList.show();

    await panel.selectList.showItemActions();
    expect(lumine.workspace.getModalTrail()).toEqual(["Prompt History", "Actions"]);

    const index = panel.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-prompt:recall-history-entry",
    );
    panel.selectList.itemActionsList.selectIndex(index);
    panel.selectList.itemActionsList.confirmSelection();

    expect(panel.selectList.getQuery()).toBe("import numpy");
    expect(panel.selectList.isVisible()).toBeTruthy();
  });
});
