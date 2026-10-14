const { Disposable } = require("lumine");

class PromptHistory {
  constructor() {
    this.entries = [];
    this.nextId = 0;
    this.listeners = new Set();
  }

  observe(callback) {
    this.listeners.add(callback);
    return new Disposable(() => this.listeners.delete(callback));
  }

  publish() {
    return Promise.all([...this.listeners].map((callback) => callback()));
  }

  destroy() {
    this.listeners.clear();
  }
}

module.exports = PromptHistory;
