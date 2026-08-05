const { CompositeDisposable, Disposable } = require("atom");

let subscriptions = null;
let provider = null;
let panel = null;

function activate() {
  subscriptions = new CompositeDisposable(
    atom.commands.add("atom-workspace", {
      "jupyter-prompt:toggle": () => toggle(),
    }),
    new Disposable(() => {
      panel?.destroy();
      panel = null;
    }),
  );
}

function deactivate() {
  subscriptions?.dispose();
  subscriptions = null;
}

function consumeJupyterKernel(jupyterProvider) {
  provider = jupyterProvider;
  return new Disposable(() => {
    provider = null;
  });
}

function toggle() {
  if (!panel) {
    const PromptPanel = require("./prompt-panel");
    // The panel asks at run time, so a kernel started after it was built —
    // or a change of active editor — is always the one that answers.
    panel = new PromptPanel(() => provider?.getActiveKernel() || null);
  }
  panel.toggle();
}

module.exports = {
  activate,
  deactivate,
  consumeJupyterKernel,
};
