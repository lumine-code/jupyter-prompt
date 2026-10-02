const path = require("node:path");

describe("prompt provider lifetime", () => {
  let main;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pkg = await lumine.packages.activatePackage(path.join(__dirname, ".."));
    main = pkg.mainModule;
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-prompt");
  });

  it("keeps a replacement provider when the old edge is disposed", async () => {
    const first = main.consumeJupyterKernel({ getActiveKernel: () => null });
    const getActiveKernel = jasmine.createSpy("getActiveKernel").and.returnValue(null);
    const replacement = main.consumeJupyterKernel({ getActiveKernel });
    const createList = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    try {
      first.dispose();
      lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-prompt:toggle");
      const list = createList.calls.mostRecent().returnValue.getModel();
      list.getQueryEditor().setText("work()");
      await list.runAction("jupyter-prompt:run-prompt");
      expect(getActiveKernel).toHaveBeenCalled();
    } finally {
      replacement.dispose();
    }
  });

  it("keeps a new lease of the same provider when its old lease is disposed", async () => {
    const getActiveKernel = jasmine.createSpy("getActiveKernel").and.returnValue(null);
    const provider = { getActiveKernel };
    const first = main.consumeJupyterKernel(provider);
    const replacement = main.consumeJupyterKernel(provider);
    const createList = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    try {
      first.dispose();
      lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-prompt:toggle");
      const list = createList.calls.mostRecent().returnValue.getModel();
      list.getQueryEditor().setText("work()");
      await list.runAction("jupyter-prompt:run-prompt");
      expect(getActiveKernel).toHaveBeenCalled();
    } finally {
      replacement.dispose();
    }
  });
});
