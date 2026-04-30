// Simple hash router for SPA
export class Router {
  constructor() {
    this.routes = {};
    this.currentPage = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  on(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/';
    const route = this.routes[hash] || this.routes['/'];
    if (route) {
      if (this.currentPage !== hash) {
        this.currentPage = hash;
        route();
      }
    }
  }

  navigate(path) {
    window.location.hash = path;
  }

  init() {
    this.resolve();
  }
}
