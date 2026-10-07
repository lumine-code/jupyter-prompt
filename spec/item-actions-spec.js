const PromptPanel = require("../lib/prompt-panel");
const path = require("node:path");

describe("Jupyter prompt item actions", () => {
  let panel;

  let keymaps;
  beforeEach(() => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    keymaps = lumine.keymaps.add(
      "jupyter-prompt-tests",
      lumine.keymaps.readKeymap(path.resolve(__dirname, "../keymaps/main.json")),
    );
    panel = new PromptPanel(
      () => null,
      () => Promise.resolve({ accepted: false, done: Promise.resolve({ status: "unavailable" }) }),
    );
  });
  afterEach(() => {
    panel.destroy();
    keymaps.dispose();
  });

  it("switches the displayed Enter action between history and the typed prompt", async () => {
    await panel.selectListHost.show();
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);
    let actions = panel.selectList.getAvailableActions();
    let byCommand = new Map(actions.map((action) => [action.command, action]));

    const run = byCommand.get("jupyter-prompt:run-history-entry");
    expect(run.name).toBe("Run History Entry");
    expect(run.description).toBe("Run the selected entry and close the panel.");
    expect(run.primary).toBe(true);

    const recall = byCommand.get("jupyter-prompt:recall-history-entry");
    expect(recall.name).toBe("Recall History Entry");
    expect(recall.description).toBe(
      "Put the selected entry back in the prompt to edit before running it.",
    );
    expect(recall.keystrokes).toEqual(["shift-enter"]);

    // Chrome and the workspace-level toggle stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("jupyter-prompt:toggle-focus")).toBe(false);

    panel.selectList.getQueryEditor().setText("1 + 1");
    panel.selectList.selectNone();
    actions = panel.selectList.getAvailableActions();
    byCommand = new Map(actions.map((action) => [action.command, action]));
    expect([...byCommand.keys()]).toEqual(["jupyter-prompt:run-prompt"]);
    expect(byCommand.get("jupyter-prompt:run-prompt").description).toBe(
      "Run the typed prompt and close the panel.",
    );
    expect(byCommand.get("jupyter-prompt:run-prompt").context).toBe("dialog");
    expect(byCommand.get("jupyter-prompt:run-prompt").primary).toBe(true);

    panel.selectList.getQueryEditor().setText("   ");
    panel.selectList.selectNone();
    expect(panel.selectList.getAvailableActions()).toEqual([]);
  });

  it("leaves Enter bound to the chrome, so it still confirms inside the actions list", () => {
    // The actions list wears the panel's own classes, so a package binding on
    // Enter would follow it in and run a history entry instead of the action
    // under the cursor. The panel binds nothing on Enter for that reason.
    panel.selectListHost.getPanel();
    const bindings = lumine.keymaps.findKeyBindings({
      keystrokes: "enter",
      target: panel.selectList.getQueryEditor().element,
    });

    expect(bindings[0].command).toBe("core:confirm");
  });

  it("runs the action against the panel's selection", async () => {
    panel.addToHistory("import numpy");
    panel.selectListHost.show();
    await panel.selectList.selectIndex(0);

    await panel.selectListHost.showActions();
    expect(lumine.workspace.getModalTrail()).toEqual(["Prompt History", "Actions"]);

    lumine.workspace.popModal();
    await panel.selectList.runAction("jupyter-prompt:recall-history-entry");

    expect(panel.selectList.getQuery()).toBe("import numpy");
    expect(panel.selectListHost.isVisible()).toBeTruthy();
  });

  it("runs the typed-prompt action once", async () => {
    panel.selectListHost.show();
    panel.selectList.getQueryEditor().setText("1 + 1");
    panel.selectList.selectNone();
    const execute = spyOn(panel, "execute");

    await panel.selectListHost.showActions();
    lumine.workspace.popModal();
    await panel.selectList.runAction("jupyter-prompt:run-prompt");

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
