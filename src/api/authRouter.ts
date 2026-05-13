import { t } from './trpc';
import { protectedProcedure } from './authMiddleware';
import { z } from 'zod';
import { hashPassword, verifyPassword, signToken } from '../lib/auth';
import { findUserByEmail, createUser, getUserCount, findUserById } from '../db/schema';
import { TRPCError } from '@trpc/server';

export const authRouter = t.router({
  register: t.procedure.input(z.object({
    email: z.string().email(),
    password: z.string().min(6),
  })).mutation(async ({ input }) => {
    const existing = findUserByEmail(input.email);
    if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });

    const passwordHash = await hashPassword(input.password);
    const id = createUser(input.email, passwordHash);
    const token = signToken({ id, email: input.email, role: 'user' });
    return { token, user: { id, email: input.email, role: 'user' } };
  }),

  login: t.procedure.input(z.object({
    email: z.string().email(),
    password: z.string(),
  })).mutation(async ({ input }) => {
    const user = findUserByEmail(input.email);
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

    const valid = await verifyPassword(input.password, String(user.password_hash));
    if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

    const token = signToken({ id: Number(user.id), email: String(user.email), role: String(user.role) });
    return { token, user: { id: Number(user.id), email: String(user.email), role: String(user.role) } };
  }),

  check: t.procedure.query(async () => {
    const count = getUserCount();
    return { needsSetup: count === 0 };
  }),

  setupFirstUser: t.procedure.input(z.object({
    email: z.string().email(),
    password: z.string().min(6),
  })).mutation(async ({ input }) => {
    const count = getUserCount();
    if (count > 0) throw new TRPCError({ code: 'FORBIDDEN', message: 'Users already exist, use register or login' });

    const passwordHash = await hashPassword(input.password);
    const id = createUser(input.email, passwordHash, 'admin');
    const token = signToken({ id, email: input.email, role: 'admin' });
    return { token, user: { id, email: input.email, role: 'admin' } };
  }),

  me: protectedProcedure.input(z.void()).query(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    const user = findUserById(ctx.user.id);
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return { id: Number(user.id), email: String(user.email), role: String(user.role), createdAt: new Date(Number(user.created_at)) };
  }),
});
