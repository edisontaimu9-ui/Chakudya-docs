/**
 * Central, minimal app state. No framework — plain object + a tiny
 * pub/sub so modules can react without being tightly coupled.
 */
const AppState = (() => {
  const state = {
    spec: null,          // parsed openapi.json
    metadata: null,       // data/endpoint-metadata.json
    endpoints: [],         // normalized flat list, see spec-loader.js
    groups: [],             // [{ tag, description, endpoints: [...] }]
    activeId: null,           // "GET /foods" style id of the selected endpoint
    searchQuery: "",
    baseUrl: "",
    authToken: "", // session-only — never persisted to storage
  };

  const listeners = {};

  function on(event, fn) {
    (listeners[event] ||= []).push(fn);
    return () => {
      listeners[event] = listeners[event].filter((f) => f !== fn);
    };
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => fn(payload));
  }

  function set(patch) {
    Object.assign(state, patch);
    emit("change", state);
    Object.keys(patch).forEach((k) => emit(`change:${k}`, state[k]));
  }

  return { state, on, emit, set };
})();
