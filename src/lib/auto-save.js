export function createAutoSave({ repository, syncWorks, getSession }) {
  let timer, running = null, queued = false, retry = 0, stopped = false;
  async function flush() {
    if (stopped || !getSession()) return;
    if (running) { queued = true; return running; }
    clearTimeout(timer);
    running = (async () => {
      let rounds = 0;
      do { queued = false; await syncWorks(repository); } while (++rounds < 5 && (queued || repository.all().some(work => work.dirty)));
      retry = 0;
    })().finally(() => { running = null; if (queued && !stopped) schedule(); });
    return running;
  }
  function schedule() {
    if (stopped || !getSession()) return;
    queued = true; clearTimeout(timer);
    if (running) return;
    timer = setTimeout(() => flush().catch(() => {
      queued = false;
      if (retry < 3 && !stopped) timer = setTimeout(schedule, 1000 * 2 ** retry++);
    }), 500);
  }
  const unsubscribe = repository.subscribe(event => { if (event === 'local') schedule(); });
  return { schedule, flush, stop() { stopped = true; clearTimeout(timer); unsubscribe(); } };
}
function publicationContent(work) {
  const pattern = work.pattern;
  return JSON.stringify([pattern.version, pattern.paletteId, pattern.name, pattern.width, pattern.height, pattern.beadSize, pattern.cells, work.sourceImageId || null, work.cutoutId || null, work.originPublicId || null]);
}
export async function ensureWorkSaved(id, expected) {
  const app = getApp(), repository = app.globalData.repository;
  const snapshot = expected || repository.find(id);
  if (!snapshot || snapshot.id !== id) throw new Error('这份作品已移除');
  const content = publicationContent(snapshot);
  await app.globalData.autoSave.flush();
  const work = repository.find(id);
  if (!work || work.dirty || !work.revision) throw new Error('作品暂未保存完成，请稍后再发布');
  if (publicationContent(work) !== content) throw new Error('图纸有更新，请重新选择后发布');
  return { work, revision: work.revision };
}
