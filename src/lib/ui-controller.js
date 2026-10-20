const states = new Map(), observers = new Map(), blockingObservers = new Set();
export function currentRoute() { const pages = getCurrentPages(); return pages[pages.length - 1]?.route || ''; }
function state(route) { if (!states.has(route)) states.set(route, { modal: null, toast: null, resolve: null, timer: null }); return states.get(route); }
function publish(route) {
  const value = state(route);
  observers.get(route)?.forEach(callback => callback({ modal: value.modal, toast: value.toast }));
  blockingObservers.forEach(callback => callback([...states.values()].some(item => item.modal)));
}
export function subscribe(route, callback) { if (!observers.has(route)) observers.set(route, new Set()); observers.get(route).add(callback); publish(route); return () => observers.get(route)?.delete(callback); }
export function observeBlocking(callback) { blockingObservers.add(callback); callback([...states.values()].some(item => item.modal)); return () => blockingObservers.delete(callback); }
export function answer(route, result) { const value = state(route), resolve = value.resolve; value.modal = null; value.resolve = null; publish(route); resolve?.(result); }
export function open(route, options) { answer(route, null); return new Promise(resolve => { Object.assign(state(route), { modal: options, resolve }); publish(route); }); }
export function notify(route, message, tone = 'success') {
  const value = state(route); clearTimeout(value.timer); value.toast = { message: String(message).slice(0, 60), tone };
  value.timer = setTimeout(() => { value.toast = null; publish(route); }, 2400); publish(route);
}
export function dismiss(route) { if (!route) return; const value = state(route); clearTimeout(value.timer); value.toast = null; answer(route, null); }
export function showBusy(message) { const route = currentRoute(), modal = { kind: 'loading', message }; open(route, modal); return () => { if (state(route).modal === modal) answer(route, null); }; }
