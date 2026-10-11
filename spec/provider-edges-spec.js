beforeEach(() => {
  for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
    if (!jasmine.isSpy(lumine.shell[method])) spyOn(lumine.shell, method).and.resolveTo();
  if (!jasmine.isSpy(lumine.application.openWindow))
    spyOn(lumine.application, "openWindow").and.resolveTo();
});

describe("Jupyter prompt independent service edges", () => {
  let main, leases;
  beforeEach(async () => {
    jasmine.useRealClock();
    leases = [];
    if (lumine.packages.isPackageLoaded("jupyter-prompt"))
      await lumine.packages.unloadPackage("jupyter-prompt");
    // An absent execution facade must not activate another package or a kernel.
    spyOn(lumine.packages, "requestService").and.resolveTo(null);
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("jupyter-prompt")).mainModule;
  });
  afterEach(async () => {
    for (const lease of leases) lease.dispose();
    if (lumine.packages.isPackageLoaded("jupyter-prompt"))
      await lumine.packages.unloadPackage("jupyter-prompt");
  });
  function provide(name, service) {
    const lease = lumine.packages.serviceHub.provide(name, "1.0.0", service);
    leases.push(lease);
    return lease;
  }
  function session(id) {
    return { id, generation: 0, isDestroyed: () => false };
  }
  function execution() {
    return {
      execute: jasmine.createSpy("execute through the selected facade").and.resolveTo({
        accepted: true,
        done: Promise.resolve({ status: "ok" }),
      }),
    };
  }
  async function run() {
    await lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
    const panel = main.getPromptPanel();
    panel.selectList.setQuery("6 * 7");
    panel.selectList.selectNone();
    await panel.selectList.runAction("jupyter-prompt:run-prompt");
    return panel;
  }
  for (const field of ["kernel", "execution"]) {
    for (const removed of ["newer", "older", "neither"]) {
      it(`${field} ${removed === "newer" ? "returns to its earlier live facade" : "retains its latest live facade"} when ${removed} edge is withdrawn`, async () => {
        const firstSession = session("first-session");
        const secondSession = session("second-session");
        const firstExecution = execution();
        const secondExecution = execution();
        let older, newer, expectedSession, expectedExecution;
        if (field === "kernel") {
          provide("jupyter.execution", firstExecution);
          older = provide("jupyter.kernel", { getActiveKernel: () => firstSession });
          newer = provide("jupyter.kernel", { getActiveKernel: () => secondSession });
          expectedSession = removed === "newer" ? firstSession : secondSession;
          expectedExecution = firstExecution;
        } else {
          provide("jupyter.kernel", { getActiveKernel: () => firstSession });
          older = provide("jupyter.execution", firstExecution);
          newer = provide("jupyter.execution", secondExecution);
          expectedSession = firstSession;
          expectedExecution = removed === "newer" ? firstExecution : secondExecution;
        }
        if (removed === "older") older.dispose();
        if (removed === "newer") newer.dispose();
        const panel = await run();
        expect(expectedExecution.execute).toHaveBeenCalledTimes(1);
        if (expectedExecution.execute.calls.any()) {
          const request = expectedExecution.execute.calls.mostRecent().args[0];
          expect(request.session).toBe(expectedSession);
          expect(request.generation).toBe(0);
          expect(request.code).toBe("6 * 7");
        }
        expect(panel.history.length).toBe(1);
        expect(panel.history[0]?.status).toBe("ok");
        expect(panel.selectListHost.isVisible()).toBe(false);
        if (field === "execution")
          expect(
            (expectedExecution === firstExecution ? secondExecution : firstExecution).execute,
          ).not.toHaveBeenCalled();
      });
    }
  }
});
