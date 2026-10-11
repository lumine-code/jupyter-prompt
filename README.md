# jupyter-prompt

Run code on the current kernel from a prompt with history.

The prompt captures the selected session when a run starts and sends code through jupyter-repl's shared execution service. Its modal editor and history belong to this package, so replacing the runtime services does not discard typed code or recorded attempts. Each service uses its latest live connection; withdrawing it restores an earlier connection while accepted work stays with its captured session.

## Features

- **Command prompt**: run typed code on the selected session without opening a source file.
- **Execution history**: retain repeated runs as separate entries, newest first, with relative ages and outcome badges.
- **Recall and rerun**: edit a selected history entry or run it again as a new attempt.
- **Explicit sessions**: capture the session and generation before waiting for execution availability.
- **Shared results**: display output through the runtime's common output dock and rendering pipeline.
- **Owned observations**: close the package's observation on deactivation without interrupting accepted kernel work or retrying an unknown outcome.

## Installation

To install `jupyter-prompt` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/jupyter-prompt`.

Install `jupyter-repl` to provide kernel sessions and execution. The prompt stays usable for browsing history and editing code while those services are unavailable.

## Commands

Commands available in `lumine-workspace`:

- `jupyter-prompt:toggle-focus`: focus the prompt, or close it when it already has focus.

Commands available in the prompt's select-list surface:

- `jupyter-prompt:run-prompt`: run the typed query and close the modal after acceptance,
- `jupyter-prompt:run-history-entry`: run the selected history entry as a new attempt,
- `jupyter-prompt:recall-history-entry`: put the selected entry back in the prompt for editing.

## Customization

Use `styles.css` to change the prompt's code and age display:

```css
.jupyter-prompt .prompt-history-item .primary-text {
  font-size: 1.1em;
}
.jupyter-prompt .prompt-time {
  color: var(--text-color-subtle);
}
```

## Services

- `jupyter.kernel`: consumed to capture the selected public session and its generation.
- `jupyter.execution`: consumed to execute that explicit session through the shared results pipeline and observe its acceptance receipt and terminal outcome.
- `background-tips.provider`: provided to teach the prompt's headline action in an empty workspace.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
