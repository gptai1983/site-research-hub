import { initTRPC } from '@trpc/server';

export interface Context {
  auth?: string;
  user?: { id: number; email: string; role: string };
}

const t = initTRPC.context<Context>().create();
export { t };
export const { router, procedure } = t;
export const middleware = t.middleware;
