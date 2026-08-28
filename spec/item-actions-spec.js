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

  it("switches the displayed Enter action between history and the typed prompt", async () => {
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);
    let actions = panel.selectList.itemActions();
    let byCommand = new Map(actions.map((action) => [action.command, action]));

    const run = byCommand.get("jupyter-prompt:run-history-entry");
    expect(run.name).toBe("Run History Entry");
    expect(run.description).toBe("Run the selected entry and close the panel.");
    expect(run.keystrokes).toEqual(["enter"]);

    const recall = byCommand.get("jupyter-prompt:recall-history-entry");
    expect(recall.name).toBe("Recall History Entry");
    expect(recall.description).toBe(
      "Put the selected entry back in the prompt to edit before running it.",
    );
    expect(recall.keystrokes).toEqual(["shift-enter"]);

    // Chrome and the workspace-level toggle stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("jupyter-prompt:toggle")).toBe(false);

    panel.selectList.refs.queryEditor.setText("1 + 1");
    panel.selectList.selectNone();
    actions = panel.selectList.itemActions();
    byCommand = new Map(actions.map((action) => [action.command, action]));
    expect([...byCommand.keys()]).toEqual(["jupyter-prompt:run-prompt"]);
    expect(byCommand.get("jupyter-prompt:run-prompt").description).toBe(
      "Run the typed prompt and close the panel.",
    );
    expect(byCommand.get("jupyter-prompt:run-prompt").scope).toBe("list");
    expect(byCommand.get("jupyter-prompt:run-prompt").keystrokes).toEqual(["enter"]);

    panel.selectList.refs.queryEditor.setText("   ");
    panel.selectList.selectNone();
    expect(panel.selectList.itemActions()).toEqual([]);
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

  it("runs the typed-prompt action once", async () => {
    panel.selectList.show();
    panel.selectList.refs.queryEditor.setText("1 + 1");
    panel.selectList.selectNone();
    const execute = spyOn(panel, "execute");

    await panel.selectList.showItemActions();
    const index = panel.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-prompt:run-prompt",
    );
    panel.selectList.itemActionsList.selectIndex(index);
    panel.selectList.itemActionsList.confirmSelection();

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
