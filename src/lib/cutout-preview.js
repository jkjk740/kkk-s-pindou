export function createPreviewQueue({ render, publish, release, settle = () => Promise.resolve(), onError = () => {} }) {
  let active = ''; let pending = ''; let queued = false; let busy = false; let disposed = false; let failed = false;
  async function pump() {
    if (busy || pending || !queued || disposed || failed) return;
    busy = true; queued = false;
    try {
      const path = await render();
      if (disposed) { await release(path); return; }
      pending = path; publish({ active, pending });
    } catch (error) { if (!disposed) { failed = true; onError(error); } }
    finally { busy = false; if (queued && !pending) pump(); }
  }
  return {
    request() { if (disposed || failed) return; queued = true; pump(); },
    async loaded(path) {
      if (disposed || pending !== path) return;
      const previous = active; active = pending; pending = ''; publish({ active, pending });
      await settle();
      if (previous) await release(previous);
      pump();
    },
    async dispose() {
      if (disposed) return;
      disposed = true; queued = false;
      const paths = [active, pending].filter(Boolean); active = ''; pending = '';
      await settle();
      await Promise.all(paths.map(release));
    }
  };
}
