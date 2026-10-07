const path = require("node:path");

async function flush() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}

describe("standalone prompt with the real runtime", () => {
  let prompt;
  let kernel;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage("language-python");
    await lumine.packages.activatePackage("jupyter-repl");
    prompt = (await lumine.packages.activatePackage(path.resolve(__dirname, ".."))).mainModule;
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-prompt");
    kernel?.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("uses an explicit real Session and puts its result in the shared output dock", async () => {
    const core = lumine.packages.getActivePackage("jupyter-repl");
    // Only the transport boundary is controlled. The Session, registry,
    // service hub, acceptance receipt and output pipeline are real.
    const KernelTransport = require(path.resolve(core.path, "lib/kernel-transport"));
    const Kernel = require(path.resolve(core.path, "lib/kernel"));
    const store = require(path.resolve(core.path, "lib/store"));
    class Transport extends KernelTransport {
      supportsComms = false;
      requests = [];
      constructor() {
        super(
          { display_name: "Python", language: "python" },
          lumine.grammars.grammarForScopeName("source.python"),
        );
        this.setLifecycle("ready");
        this.setExecutionState("idle");
      }
      execute(code, receive) {
        this.requests.push({ code, receive });
        return { cancelQueued: () => false };
      }
    }
    kernel = new Kernel(new Transport());
    store.commitNotebookKernel(store.prepareNotebookKernel(kernel, "prompt-session"));
    store.setExternalKernel(kernel);
    await flush();
    const session = core.mainModule.provideJupyterKernel().getRunningKernels()[0];
    expect(prompt.getKernelProvider().getActiveKernel()).toBe(session);
    lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
    const panel = prompt.getPromptPanel();
    const run = panel.run("6 * 7");
    await flush();
    const request = kernel.transport.requests[0];
    expect(request.code).toBe("6 * 7");
    const reply = (type, content, channel = "iopub") =>
      request.receive(
        {
          header: { msg_id: type, msg_type: type },
          parent_header: { msg_id: "request", msg_type: "execute_request" },
          content,
        },
        channel,
      );
    reply("execute_result", { data: { "text/plain": "42" }, metadata: {}, execution_count: 1 });
    reply("execute_reply", { status: "ok" }, "shell");
    reply("status", { execution_state: "idle" });
    await run;
    expect(panel.history[0].status).toBe("ok");
    const outputURI = "lumine://jupyter-repl/output-area";
    expect(lumine.workspace.getPaneItems().some((item) => item.getURI?.() === outputURI)).toBe(
      true,
    );
    expect(lumine.workspace.paneContainerForURI(outputURI) !== lumine.workspace.getCenter()).toBe(
      true,
    );
    expect(kernel.outputStore.outputs[0].data["text/plain"]).toBe("42");
  });
});
