describe("prompt history across workspace windows", () => {
  let main;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("jupyter-prompt")).mainModule;
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-prompt");
    await lumine.workspace.discardEditorWindows();
  });
  it("owns one local host per window while sharing history and entry identities", async () => {
    lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
    const first = main.getPromptPanel();
    first.addToHistory("first entry");
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    lumine.commands.dispatch(extra.getElement(), "jupyter-prompt:toggle-focus");
    const second = main.getPromptPanel();
    expect(second).not.toBe(first);
    expect(second.selectList.getElement().ownerDocument).toBe(extra.getDocument());
    expect(second.history).toBe(first.history);
    second.addToHistory("second entry");
    await lumine.views.getNextUpdatePromise();
    expect(first.selectList.getItems().map((entry) => entry.code)).toEqual([
      "second entry",
      "first entry",
    ]);
    expect(first.history.map((entry) => entry.id)).toEqual([2, 1]);
    await lumine.workspace.closeEditorWindow(extra);
    expect(second.destroyed).toBeTrue();
    lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
    expect(main.getPromptPanel()).toBe(first);
    expect(first.history.length).toBe(2);
  });
  it("hides an already focused auxiliary prompt from the same command", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    lumine.commands.dispatch(extra.getElement(), "jupyter-prompt:toggle-focus");
    const panel = main.getPromptPanel();
    await panel.selectListHost.show();
    panel.selectList.getQueryEditor().getElement().focus();
    lumine.commands.dispatch(extra.getElement(), "jupyter-prompt:toggle-focus");
    expect(panel.selectListHost.isVisible()).toBeFalse();
  });
});
