const { CompositeDisposable } = require("lumine");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");

// "2 minutes ago" reads better than a clock time on a list that is always
// about the last stretch of work. dayjs picks the unit and the wording,
// including the vaguer near end of the scale — "a few seconds ago" rather than
// a count. git-panel and github-panel date their rows the same way.
dayjs.extend(relativeTime);

// The outcome badge, one class list per recorded status.
const STATUS_BADGES = {
  running: "badge-info icon icon-sync",
  ok: "badge-success icon icon-check",
  error: "badge-error icon icon-x",
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
  constructor(getKernel) {
    this.getKernel = getKernel;
    this.history = [];

    this.selectList = lumine.workspace.buildSelectList({
      className: "jupyter-prompt",
      crumb: "Prompt History",
      emptyMessage: "No history to show. Enter code above to execute.",
      placeholderText: "Enter code to execute...",
      // Selecting nothing is a state of its own here: it is what makes Enter
      // run the prompt rather than an entry. So the list opens in it, and the
      // arrows return to it when they step off either end instead of wrapping
      // the two ends into each other, which would leave the prompt reachable
      // only with the mouse.
      allowEmptySelection: true,
      // No `willShow`: every change to the history goes through addToHistory,
      // which hands the list its new items there and then, so the list is
      // already current when the panel opens. Re-seeding it on show would also
      // reset the selection, and the modal flow shows the panel again on the
      // way back from the actions list — dropping the very entry the action
      // was picked for.
      filterKeyForItem: (entry) => entry.code,
      // Age and outcome go in the trailing block, so they line up down the
      // right edge instead of trailing code of every length. The outcome sits
      // outermost: it is the one thing worth scanning the column for, and it
      // is a fixed-width glyph, so it holds that edge straight while the age
      // beside it changes width as it is written out. The code itself is
      // monospaced by the stylesheet — it is read as code, not as prose.
      elementForItem: (entry, { filterKey, highlight }) => ({
        className: "prompt-history-item",
        primary: highlight(filterKey),
        trailing: [
          { text: dayjs(entry.timestamp).fromNow(), className: "prompt-time badge" },
          statusBadge(entry),
        ],
      }),
      didConfirmSelection: (entry) => this.run(entry.code),
      didConfirmEmptySelection: () => this.execute(),
      didCancelSelection: () => this.selectList.hide(),
    });

    // Registered in the package's own namespace: the item-actions list (F12)
    // derives its rows — label, description, keybinding — from these
    // registrations and the keymap, so nothing is documented twice. Running is
    // listed like any other action even though Enter reaches it as chrome,
    // through core:confirm and didConfirmSelection; routing it back through
    // the list's own confirm keeps the key, a click on a row, and the action
    // on one path.
    this.disposables = new CompositeDisposable(
      lumine.commands.add(this.selectList.element, {
        "jupyter-prompt:run-history-entry": {
          description: "Run the selected entry and close the panel",
          didDispatch: () => this.selectList.confirmSelection(),
        },
        "jupyter-prompt:recall-history-entry": {
          description: "Put the selected entry back in the prompt to edit before running it",
          didDispatch: () => this.recallSelection(),
        },
      }),
    );
  }

  toggle() {
    this.selectList.toggle();
  }

  /**
   * Runs whatever is typed in the prompt.
   */
  async execute() {
    const code = this.selectList.getQuery().trim();
    if (!code) return;

    await this.run(code);
  }

  /**
   * Puts the selected entry back in the prompt so it can be edited before
   * running. The panel stays open and the selection is dropped, so Enter then
   * runs what is in the prompt rather than the entry it came from.
   */
  recallSelection() {
    const entry = this.selectList.getSelectedItem();
    if (!entry) return;

    this.selectList.refs.queryEditor.setText(entry.code);
    this.selectList.selectNone();
  }

  /**
   * Executes code on the running kernel and closes the panel, whether the code
   * was typed or picked from the history — the point of running it is to see
   * its output. The attempt is recorded before it starts, so a run that never
   * finishes is still listed, and the prompt is cleared with the panel so the
   * next open starts on the whole history instead of filtered to the last
   * thing run. Nothing is cleared or closed when there is no kernel to run on:
   * the typed code survives to be run once one is started.
   * @param {string} code - The code to execute
   */
  async run(code) {
    const kernel = this.getKernel();
    if (!kernel) {
      lumine.notifications.addError("No kernel running");
      return;
    }

    this.selectList.reset();
    this.selectList.hide();

    const entry = this.addToHistory(code, "running");

    const result = await kernel.execute(code);
    entry.status = result.status;
    if (result.status === "error") {
      entry.error = result.error;
    }

    await this.selectList.update({ items: this.history });
  }

  addToHistory(text, status = "ok") {
    const entry = {
      code: text,
      timestamp: new Date(),
      status,
      error: null,
    };

    this.history.unshift(entry);
    this.selectList.update({ items: this.history });

    return entry;
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }
}

module.exports = PromptPanel;
