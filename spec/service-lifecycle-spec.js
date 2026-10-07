const path = require("node:path");

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

function session(id = "selected-session") {
  return { id, generation: 0, isDestroyed: () => false };
}

function execution(result = { status: "ok" }, accepted = true) {
  return {
    execute: jasmine.createSpy("execute explicit session").and.resolveTo({
      accepted,
      done: Promise.resolve(result),
    }),
  };
}

describe("standalone prompt service ownership", () => {
  let main;
  let panel;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    main = (await lumine.packages.activatePackage(path.resolve(__dirname, ".."))).mainModule;
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-prompt");
  });
  function open() {
    lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
    panel = main.getPromptPanel();
    return panel;
  }

  it("publishes its command before constructing the modal", () => {
    expect(main.getPromptPanel()).toBeNull();
    expect(open().selectListHost.isVisible()).toBe(true);
  });

  it("keeps typed code and history while old same-object edges detach", () => {
    const provider = { getActiveKernel: () => session() };
    const execute = execution();
    const oldKernel = main.consumeJupyterKernel(provider);
    const oldExecution = main.consumeJupyterExecution(execute);
    open();
    panel.addToHistory("previous()");
    panel.selectList.setQuery("still typing");
    main.consumeJupyterKernel(provider);
    main.consumeJupyterExecution(execute);
    oldKernel.dispose();
    oldExecution.dispose();
    expect(main.getKernelProvider()).toBe(provider);
    expect(main.getExecutionService()).toBe(execute);
    expect(main.getPromptPanel()).toBe(panel);
    expect(panel.selectList.getQuery()).toBe("still typing");
    expect(panel.history[0].code).toBe("previous()");
  });

  it("captures the session before waiting instead of following a later active session", async () => {
    const selected = session();
    let active = selected;
    let ready;
    spyOn(lumine.packages, "requestService").and.returnValue(
      new Promise((resolve) => {
        ready = resolve;
      }),
    );
    main.consumeJupyterKernel({ getActiveKernel: () => active });
    open();
    panel.selectList.setQuery("work()");
    const run = panel.execute();
    active = session("other-session");
    const execute = execution();
    main.consumeJupyterExecution(execute);
    ready(true);
    await run;
    expect(execute.execute).toHaveBeenCalledTimes(1);
    const request = execute.execute.calls.mostRecent().args[0];
    expect(request.session === selected).toBe(true);
    expect(request.generation).toBe(0);
    expect(request.code).toBe("work()");
    expect(panel.history[0].status).toBe("ok");
  });

  it("refuses a changed generation before acceptance and preserves typed code", async () => {
    const selected = session();
    let ready;
    spyOn(lumine.packages, "requestService").and.returnValue(
      new Promise((resolve) => {
        ready = resolve;
      }),
    );
    main.consumeJupyterKernel({ getActiveKernel: () => selected });
    open();
    panel.selectList.setQuery("work()");
    const run = panel.execute();
    selected.generation++;
    const execute = execution();
    main.consumeJupyterExecution(execute);
    ready(true);
    await run;
    expect(execute.execute).not.toHaveBeenCalled();
    expect(panel.selectListHost.isVisible()).toBe(true);
    expect(panel.selectList.getQuery()).toBe("work()");
    expect(panel.history[0].status).toBe("unavailable");
  });

  it("cancels preparation immediately when its provider disappears", async () => {
    spyOn(lumine.packages, "requestService").and.returnValue(new Promise(() => {}));
    const edge = main.consumeJupyterKernel({ getActiveKernel: () => session() });
    open();
    panel.selectList.setQuery("work()");
    const run = panel.execute();
    edge.dispose();
    await run;
    expect(panel.history[0].status).toBe("cancelled");
    expect(panel.selectList.getQuery()).toBe("work()");
  });

  it("preserves an accepted unknown outcome after its provider edge retires without replay", async () => {
    let finish;
    const execute = {
      execute: jasmine.createSpy("execute once").and.resolveTo({
        accepted: true,
        done: new Promise((resolve) => {
          finish = resolve;
        }),
      }),
    };
    const edge = main.consumeJupyterKernel({ getActiveKernel: () => session() });
    main.consumeJupyterExecution(execute);
    open();
    const run = panel.run("side_effect()");
    await flush();
    const signal = execute.execute.calls.mostRecent().args[0].signal;
    edge.dispose();
    expect(signal.aborted).toBe(false);
    finish({
      status: "unknown",
      error: { ename: "ExecutionOutcomeUnknown", evalue: "May have run." },
    });
    await run;
    expect(panel.history[0].status).toBe("unknown");
    expect(execute.execute).toHaveBeenCalledTimes(1);
  });

  it("aborts its owned accepted observation when the prompt package deactivates", async () => {
    let signal;
    const execute = {
      execute: ({ signal: owned }) => {
        signal = owned;
        return {
          accepted: true,
          done: new Promise((resolve) =>
            owned.addEventListener("abort", () => resolve({ status: "cancelled" }), { once: true }),
          ),
        };
      },
    };
    main.consumeJupyterKernel({ getActiveKernel: () => session() });
    main.consumeJupyterExecution(execute);
    open();
    const run = panel.run("work()");
    await flush();
    main.deactivate();
    const update = spyOn(panel.selectList, "setItems");
    await run;
    expect(signal.aborted).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(main.getPromptPanel()).toBeNull();
  });

  it("keeps the modal and typed query when execution refuses acceptance", async () => {
    main.consumeJupyterKernel({ getActiveKernel: () => session() });
    main.consumeJupyterExecution(execution({ status: "unavailable" }, false));
    open();
    panel.selectList.setQuery("work()");
    await panel.execute();
    expect(panel.selectListHost.isVisible()).toBe(true);
    expect(panel.selectList.getQuery()).toBe("work()");
  });
});
