export function createCutoutSession(identity) {
  let active = true; let revision = 0; let candidate = null;
  return { identity: { ...identity }, stamp: () => revision, current: stamp => active && revision === stamp, edited() { revision++; }, offer(value, stamp) { if (!active) return false; candidate = { value, stale: revision !== stamp }; return true; }, candidate: () => candidate, cancel() { active = false; candidate = null; } };
}
