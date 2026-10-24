type PendingPreview = { url: string; promise: Promise<boolean>; finish(value: boolean): void };

/** Download the final public image, with bounded work and no account cookies. */
export function createPreviewWarmer({ fetcher = fetch, now = Date.now, concurrency = 2 } = {}) {
  const pending = new Map<string, PendingPreview>();
  const warmed = new Map<string, number>();
  const queue: PendingPreview[] = [];
  const controllers = new Set<AbortController>();
  let active = 0;
  let disposed = false;

  async function download(job: PendingPreview) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetcher(job.url, { credentials: "omit", signal: controller.signal });
      // Consume the stream: headers alone do not mean the image is generated
      // or that the CDN has a complete response to reuse.
      await response.arrayBuffer();
      const ttl = Math.max(0, Number(response.headers.get("X-BizuMiner-Preview-Ttl"))
        - Number(response.headers.get("Age") ?? 0));
      const ready = response.ok && response.headers.get("X-BizuMiner-Preview") === "ready" && ttl > 0;
      if (ready && !disposed) {
        if (warmed.size >= 50) warmed.delete(warmed.keys().next().value!);
        warmed.set(job.url, now() + Math.min(ttl, 300) * 1000);
      }
      job.finish(ready);
    } catch { job.finish(false); }
    finally {
      clearTimeout(timer);
      controllers.delete(controller);
      pending.delete(job.url);
      active -= 1;
      pump();
    }
  }

  function pump() {
    while (!disposed && active < concurrency && queue.length) {
      active += 1;
      void download(queue.shift()!);
    }
  }

  return {
    warm(url: string, priority = false): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if ((warmed.get(url) ?? 0) > now()) return Promise.resolve(true);
      const existing = pending.get(url);
      if (existing) {
        const index = queue.indexOf(existing);
        if (priority && index > 0) queue.unshift(...queue.splice(index, 1));
        return existing.promise;
      }
      let finish!: (value: boolean) => void;
      const promise = new Promise<boolean>((resolve) => { finish = resolve; });
      const job = { url, promise, finish };
      pending.set(url, job);
      if (priority) queue.unshift(job); else queue.push(job);
      pump();
      return promise;
    },
    dispose() {
      disposed = true;
      for (const job of queue.splice(0)) { pending.delete(job.url); job.finish(false); }
      for (const controller of controllers) controller.abort();
      warmed.clear();
    },
  };
}
