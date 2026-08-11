# jupyter-prompt

Run code on the current kernel from a prompt with history.

A modal prompt over the running kernel: type code, press Enter, and it executes where your inline results already go. The list under the prompt is the session's history, newest first — filter it like any picker, re-run an entry, or recall one into the prompt to edit before running.

## Features

- **A prompt, not a buffer**: run one-off code — imports, magics, quick checks — without touching the file.
- **Session history**: every run is its own entry with its outcome and age; running the same code twice records twice.
- **Re-run or recall**: Enter re-runs the selected entry; recalling puts it back in the prompt for editing first.
- **Outcome badges**: each entry carries ok, error (with the exception as its tooltip), or still-running.
- **Current kernel, always**: the prompt asks at run time, so it follows the active editor's kernel.

## Installation

To install `jupyter-prompt` search for _jupyter-prompt_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/jupyter-prompt`.

## Commands

Commands available in `lumine-workspace`:

- `jupyter-prompt:toggle`: open or close the prompt.

Commands available in `.jupyter-prompt`:

- `jupyter-prompt:run-history-entry`: run the selected entry and close the panel,
- `jupyter-prompt:recall-history-entry`: put the selected entry back in the prompt to edit before running it.

## Services

- **jupyter.kernel** (`^1.0.0`): consumed to execute code on the active editor's kernel.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
