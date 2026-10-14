// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-python", "jupyter-cells", "jupyter-repl"],
  viewport: { width: 1200, height: 760 },
  async before() {},
  async prepare(context) {
    const { lumine, state, fixture, open, profile } = context;
    state.jupyterData = require("path").join(profile, "jupyter");
    const kernel = require("path").join(state.jupyterData, "kernels", "lumine-demo");
    require("fs").mkdirSync(kernel, { recursive: true });
    require("fs").writeFileSync(
      require("path").join(kernel, "kernel.json"),
      JSON.stringify({
        argv: [
          process.env.LUMINE_DEMO_PYTHON || "python",
          "-m",
          "ipykernel_launcher",
          "-f",
          "{connection_file}",
        ],
        display_name: "Python 3",
        language: "python",
      }),
    );
    state.editor = await open("jupyter/signal.py");
    await lumine.project.setPaths([fixture("jupyter")]);
    process.env.JUPYTER_PATH = state.jupyterData;
    lumine.grammars.assignLanguageMode(state.editor.getBuffer(), "source.python");
    await state.editor.getBuffer().getLanguageMode().ready;
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Run a Python expression from the prompt and review the execution history.",
      timeout: 60000,
      async run(context) {
        const { lumine, state, waitFor } = context;
        {
          state.editor.selectAll();
          lumine.commands.dispatch(lumine.views.getView(state.editor), "jupyter-repl:run");
          await waitFor(
            () => document.body.innerText.includes("Mean amplitude: 0.42"),
            "step 1",
            60000,
          );
        }
        {
          lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-prompt:toggle-focus");
          const p = lumine.packages.getActivePackage("jupyter-prompt").mainModule.getPromptPanel();
          await p.run("round(mean, 2)");
          state.prompt = p;
          state.editor.setCursorBufferPosition([state.editor.getLastBufferRow(), 0]);
        }
      },
      async afterPointerMove({ state }) {
        await state.prompt.selectListHost.show();
      },
      ready({ state }) {
        return (
          state.prompt.selectListHost.isVisible() &&
          state.prompt.selectList.getElement().getBoundingClientRect().height > 0 &&
          state.prompt.selectList.getElement().innerText.includes("round(mean, 2)")
        );
      },
    },
  ],
  async cleanup() {},
};
