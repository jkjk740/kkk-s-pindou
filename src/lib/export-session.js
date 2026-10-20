export function createExportSession({ pages, renderPage, savePage, onProgress, releaseFile }) {
  let completed = 0; let file = ''; let running = null;
  async function proceed() {
    while (completed < pages.length) {
      if (!file) { onProgress?.({ phase: 'drawing', page: completed + 1, total: pages.length }); file = await renderPage(pages[completed]); }
      onProgress?.({ phase: 'saving', page: completed + 1, total: pages.length });
      try { await savePage(file); }
      catch (error) { error.retryPath = file; throw error; }
      completed++; const previous = file; file = ''; await releaseFile?.(previous);
    }
    return { completed, total: pages.length };
  }
  function run() { if (!running) running = proceed().finally(() => { running = null; }); return running; }
  return { run, retry: run, status: () => ({ completed, total: pages.length, file, complete: completed === pages.length }) };
}
