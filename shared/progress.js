// Shared progress store. Every level page loads this; the landing page reads it.
// Data lives in the player's browser (localStorage), keyed by level id.
window.GameKit = {
  key: 'games.progress.v1',
  get() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  },
  set(id, patch) {
    try {
      const all = this.get();
      all[id] = { ...all[id], ...patch };
      localStorage.setItem(this.key, JSON.stringify(all));
    } catch { /* storage blocked — game still works */ }
  },
  played(id) { this.set(id, { played: true }); },
  complete(id) { this.set(id, { completed: true }); },
  best(id, score) {
    const cur = this.get()[id] || {};
    if (!(cur.best >= score)) this.set(id, { best: score });
  }
};
