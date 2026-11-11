export interface Env {
  CODYNEX_API_URL: string;
  WORKER_TICK_SECRET: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!env.CODYNEX_API_URL || !env.WORKER_TICK_SECRET) {
      return;
    }
    const res = await fetch(`${env.CODYNEX_API_URL}/api/v1/codynex/workers/tick`, {
      method: 'POST',
      headers: {
        'X-Worker-Secret': env.WORKER_TICK_SECRET,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`CodyNex OS worker tick failed: HTTP ${res.status}`);
    }
  },
};
