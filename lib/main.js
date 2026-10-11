const { CompositeDisposable, Disposable } = require("lumine");
let subscriptions = null;
let lifetime = null;
let kernelEdge = null;
let executionEdge = null;
let kernelEdges = [];
let executionEdges = [];
let panel = null;
const pending = new Set();

function refuse(status, reason) {
  return {
    accepted: false,
    done: Promise.resolve({
      status,
      reason,
      error: { ename: "PromptUnavailable", evalue: reason },
    }),
  };
}
function retirePreparation(edge, field) {
  for (const request of pending)
    if (request[field] === edge && !request.handedOff) request.controller.abort();
}
function activate() {
  lifetime = {};
  kernelEdge = executionEdge = null;
  kernelEdges = [];
  executionEdges = [];
  subscriptions = new CompositeDisposable(
    lumine.commands.add("lumine-workspace", { "jupyter-prompt:toggle-focus": () => toggleFocus() }),
  );
}
function deactivate() {
  lifetime = null;
  for (const request of pending) request.controller.abort();
  subscriptions?.dispose();
  subscriptions = null;
  panel?.destroy();
  panel = null;
  kernelEdge = executionEdge = null;
  kernelEdges = [];
  executionEdges = [];
}
function consumeJupyterKernel(service) {
  const owner = lifetime;
  const edges = kernelEdges;
  const previous = kernelEdge;
  const edge = (kernelEdge = { service });
  edges.push(edge);
  if (previous) retirePreparation(previous, "kernelEdge");
  return new Disposable(() => {
    const index = edges.indexOf(edge);
    if (index !== -1) edges.splice(index, 1);
    if (lifetime !== owner || kernelEdges !== edges || kernelEdge !== edge) return;
    kernelEdge = edges.at(-1) ?? null;
    retirePreparation(edge, "kernelEdge");
  });
}
function consumeJupyterExecution(service) {
  const owner = lifetime;
  const edges = executionEdges;
  const previous = executionEdge;
  const edge = (executionEdge = { service });
  edges.push(edge);
  if (previous) retirePreparation(previous, "executionEdge");
  return new Disposable(() => {
    const index = edges.indexOf(edge);
    if (index !== -1) edges.splice(index, 1);
    if (lifetime !== owner || executionEdges !== edges || executionEdge !== edge) return;
    executionEdge = edges.at(-1) ?? null;
    retirePreparation(edge, "executionEdge");
  });
}
function getActiveSession() {
  try {
    return kernelEdge?.service.getActiveKernel() || null;
  } catch {
    return null;
  }
}
async function waitForExecution(request) {
  if (executionEdge) return;
  const { signal } = request.controller;
  let cancel;
  const aborted = new Promise((resolve) => {
    cancel = resolve;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try {
    await Promise.race([lumine.packages.requestService("jupyter.execution", "^1.0.0"), aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
async function executePrompt(code, session) {
  const owner = lifetime;
  if (!owner || !kernelEdge || session.isDestroyed())
    return refuse("unavailable", "The selected Jupyter session is no longer available.");
  const request = {
    owner,
    kernelEdge,
    executionEdge,
    session,
    generation: session.generation,
    controller: new AbortController(),
    handedOff: false,
  };
  pending.add(request);
  const release = () => pending.delete(request);
  try {
    await waitForExecution(request);
    if (
      request.controller.signal.aborted ||
      lifetime !== owner ||
      kernelEdge !== request.kernelEdge
    ) {
      release();
      return refuse("cancelled", "The prompt's service connection changed before execution.");
    }
    if (session.isDestroyed() || session.generation !== request.generation || !executionEdge) {
      release();
      return refuse(
        "unavailable",
        "The selected Jupyter session or execution service is unavailable.",
      );
    }
    request.executionEdge = executionEdge;
    request.handedOff = true;
    const receipt = await executionEdge.service.execute({
      session,
      generation: request.generation,
      code,
      signal: request.controller.signal,
    });
    // Accepted work belongs to its core Session. Provider retirement must not
    // replace an unknown outcome with caller cancellation or reroute the code.
    return { ...receipt, done: receipt.done.finally(release) };
  } catch (error) {
    release();
    return refuse("error", error.message || String(error));
  }
}
function toggleFocus() {
  if (!lifetime) return;
  if (!panel) {
    const PromptPanel = require("./prompt-panel");
    panel = new PromptPanel(getActiveSession, executePrompt);
  }
  return panel.toggleFocus();
}
module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "jupyter-prompt",
      tips: [
        "You can run code on the current Jupyter kernel with {{ 'jupyter-prompt:toggle-focus' | keystroke }}",
      ],
    };
  },
  activate,
  deactivate,
  consumeJupyterKernel,
  consumeJupyterExecution,
  getPromptPanel: () => panel,
  getKernelProvider: () => kernelEdge?.service || null,
  getExecutionService: () => executionEdge?.service || null,
};
