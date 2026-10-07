const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function relativeAge(timestamp) {
  const seconds = (timestamp.getTime() - Date.now()) / 1000;
  const magnitude = Math.abs(seconds);
  const [divisor, unit] =
    magnitude < 60
      ? [1, "second"]
      : magnitude < 3600
        ? [60, "minute"]
        : magnitude < 86400
          ? [3600, "hour"]
          : [86400, "day"];
  return relativeTime.format(Math.round(seconds / divisor), unit);
}

// The outcome badge, one class list per recorded status.
const STATUS_BADGES = {
  running: "badge-info icon icon-sync",
  ok: "badge-success icon icon-check",
  error: "badge-error icon icon-x",
  timeout: "badge-warning icon icon-clock",
  cancelled: "badge-warning icon icon-circle-slash",
  unavailable: "badge-error icon icon-plug",
  unknown: "badge-warning icon icon-question",
};

/**
 * Builds the outcome badge for an entry. A node rather than a descriptor so a
 * failed entry can carry the exception as its tooltip.
 * @param {Object} entry - The history entry to describe
 * @returns {HTMLSpanElement} The badge element
 */
function statusBadge(entry) {
  const badge = document.createElement("span");
  badge.className = `prompt-status badge ${STATUS_BADGES[entry.status] ?? STATUS_BADGES.running}`;
  if (entry.error) {
    badge.title = `${entry.error.ename}: ${entry.error.evalue}`;
  }
  return badge;
}

/**
 * A modal panel for executing code on the running kernel, over a history list.
 *
 * The query editor is the prompt and the list below it is the session's
 * history, newest first. Nothing is deduplicated: a history records what
 * happened, so running the same code twice leaves two entries, each with its
 * own outcome and time.
 */
class PromptPanel {
  /**
   * @param {Function} getKernel - Answers the kernel to run on, or null. Asked
   *   per run, so the panel always executes against the current context.
   */
  constructor(getKernel, executePrompt) {
    this.getKernel = getKernel;
    this.executePrompt = executePrompt;
    this.history = [];
    this.nextHistoryId = 0;
    this.destroyed = false;

    const selectListOptions = {
      emptyMessage: "No history yet — enter code above to execute",
      placeholderText: "Enter code to execute...",
      // Selecting nothing is a state of its own here: it is what makes Enter
      // run the prompt rather than an entry. So the list opens in it, and the
      // arrows return to it when they step off either end instead of wrapping
      // the two ends into each other, which would leave the prompt reachable
      // only with the mouse.
      selection: { allowEmpty: true, initial: { mode: "none" } },
      // No opening source: every change to the history goes through addToHistory,
      // which hands the list its new items there and then, so the list is
      // already current when the panel opens. Re-seeding it on show would also
      // reset the selection, and the modal flow shows the panel again on the
      // way back from the actions list — dropping the very entry the action
      // was picked for.
      getItemId: (entry) => entry.id,
      search: { getFilterText: (entry) => entry.code },
      // Age and outcome go in the trailing block, so they line up down the
      // right edge instead of trailing code of every length. The outcome sits
      // outermost: it is the one thing worth scanning the column for, and it
      // is a fixed-width glyph, so it holds that edge straight while the age
      // beside it changes width as it is written out. The code itself is
      // monospaced by the stylesheet — it is read as code, not as prose.
      renderItem: (entry, { filterKey, highlight }) => ({
        className: "prompt-history-item",
        primary: highlight(filterKey),
        trailing: [
          { text: relativeAge(entry.timestamp), className: "prompt-time badge" },
          statusBadge(entry),
        ],
      }),
      commands: {
        "jupyter-prompt:run-prompt": {
          description: "Run the typed prompt and close the panel.",
          didDispatch: (event) => this.execute(event.detail.query),
        },
        "jupyter-prompt:run-history-entry": {
          description: "Run the selected entry and close the panel.",
          didDispatch: (event) => this.run(event.detail.item.code),
        },
        "jupyter-prompt:recall-history-entry": {
          description: "Put the selected entry back in the prompt to edit before running it.",
          didDispatch: (event) => this.recallSelection(event.detail.item),
        },
      },
      actions: [
        {
          command: "jupyter-prompt:run-prompt",
          context: "dialog",
          when: ({ item, query }) => item == null && Boolean(query.trim()),
          primary: true,
          group: "Run",
          // No kernel is a validation failure that keeps the typed code open;
          // run() closes the panel only after it finds a kernel.
          disposition: "stay",
          dispatch: "local",
        },
        {
          command: "jupyter-prompt:run-history-entry",
          context: "item",
          primary: true,
          group: "Run",
          disposition: "stay",
          dispatch: "local",
        },
        {
          command: "jupyter-prompt:recall-history-entry",
          context: "item",
          group: "Edit",
          disposition: "stay",
          dispatch: "local",
        },
      ],
    };
    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      className: "jupyter-prompt",
      crumb: "Prompt History",
    });
    this.selectList = this.selectListHost.getModel();
  }

  toggleFocus() {
    if (this.destroyed) return;
    if (
      this.selectListHost.isVisible() &&
      this.selectList.getElement().contains(document.activeElement)
    )
      return this.selectListHost.hide();
    return this.selectListHost.show();
  }

  /**
   * Runs whatever is typed in the prompt.
   */
  async execute(query = this.selectList.getQuery()) {
    const code = query.trim();
    if (!code) return;

    await this.run(code);
  }

  /**
   * Puts the selected entry back in the prompt so it can be edited before
   * running. The panel stays open and the selection is dropped, so Enter then
   * runs what is in the prompt rather than the entry it came from.
   */
  recallSelection(entry = this.selectList.getSelectedItem()) {
    if (!entry) return;

    this.selectList.setQuery(entry.code);
    this.selectList.selectNone();
  }

  /**
   * Executes code on the running kernel and closes the panel after acceptance, whether the code
   * was typed or picked from the history — the point of running it is to see
   * its output. The attempt is recorded before it starts, so a run that never
   * finishes is still listed, and the next open starts on the whole history
   * instead of filtered to the last thing run — the list clears its own query
   * whenever it opens. Nothing is closed when there is no kernel to run on:
   * the typed code survives to be run once one is started.
   * @param {string} code - The code to execute
   */
  async run(code) {
    if (this.destroyed) return;
    const kernel = this.getKernel();
    if (!kernel) {
      lumine.notifications.addWarning(
        "Start or select a Jupyter kernel before running the prompt.",
      );
      return;
    }

    const entry = this.addToHistory(code, "running");

    try {
      const receipt = await this.executePrompt(code, kernel);
      if (receipt.accepted && !this.destroyed) this.selectListHost.hide();
      const result = await receipt.done;
      entry.status = result?.status || "error";
      if (entry.status !== "ok") {
        entry.error = result?.error || {
          ename: "ExecutionFailed",
          evalue: `The kernel returned ${result?.status || "no execution result"}.`,
        };
      }
    } catch (error) {
      entry.status = "error";
      entry.error = {
        ename: error?.name || "ExecutionFailed",
        evalue: error?.message || String(error),
      };
    }

    // An execution can finish after deactivation closed the prompt. Its code
    // was already sent, but the old list must not render into a dead editor.
    if (!this.destroyed) await this.selectList.setItems(this.history);
  }

  addToHistory(text, status = "ok") {
    const entry = {
      id: ++this.nextHistoryId,
      code: text,
      timestamp: new Date(Date.now()),
      status,
      error: null,
    };

    this.history.unshift(entry);
    this.selectList.setItems(this.history);

    return entry;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.getKernel = () => null;
    return this.selectListHost.destroy();
  }
}

module.exports = PromptPanel;
