const { CompositeDisposable, Disposable } = require("lumine");

let subscriptions = null;
let provider = null;
let providerConnection = null;
let panel = null;

function activate() {
  subscriptions = new CompositeDisposable(
    lumine.commands.add("lumine-workspace", {
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
  provider = null;
  providerConnection = null;
}

function consumeJupyterKernel(jupyterProvider) {
  const connection = {};
  providerConnection = connection;
  provider = jupyterProvider;
  return new Disposable(() => {
    if (providerConnection !== connection) return;
    provider = null;
    providerConnection = null;
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
  provideBackgroundTips() {
    return {
      packageName: "jupyter-prompt",
      tips: [
        "You can run code on the current Jupyter kernel with {{ 'jupyter-prompt:toggle' | keystroke }}",
      ],
    };
  },

  activate,
  deactivate,
  consumeJupyterKernel,
};
