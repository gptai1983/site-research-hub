import { t, Context } from './trpc';
import { verifyToken, JwtPayload } from '../lib/auth';
import { TRPCError } from '@trpc/server';

export const isAuthed = t.middleware(async ({ ctx, next }) => {
  const token = ctx.auth?.replace('Bearer ', '');
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  try {
    const user = verifyToken(token);
    return next({ ctx: { ...ctx, user } });
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token expired or invalid' });
  }
});

export const protectedProcedure = t.procedure.use(isAuthed);
