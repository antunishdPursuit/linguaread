import { DurableObject } from 'cloudflare:workers';

export const DAILY_ANALYSIS_LIMIT = 3;

const ALLOWANCE_STATE_KEY = 'daily-analysis-allowance-v1';
const DAY_MS = 24 * 60 * 60 * 1_000;
const RESERVATION_TTL_MS = 60_000;
const RESERVATION_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

type AllowanceState = {
  completed: number;
  day: string;
  reservations: Record<string, number>;
};

export type DailyAllowanceReservation = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

export type DailyAllowanceCommit = {
  committed: boolean;
  remaining: number;
};

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function nextUtcDay(nowMs: number): string {
  const nextMidnight = (Math.floor(nowMs / DAY_MS) + 1) * DAY_MS;
  return new Date(nextMidnight).toISOString();
}

function normalizeState(value: unknown, nowMs: number): AllowanceState {
  const day = utcDay(nowMs);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('day' in value) ||
    value.day !== day ||
    !('completed' in value) ||
    typeof value.completed !== 'number' ||
    !Number.isInteger(value.completed) ||
    value.completed < 0 ||
    !('reservations' in value) ||
    typeof value.reservations !== 'object' ||
    value.reservations === null
  ) {
    return { completed: 0, day, reservations: {} };
  }

  const reservations = Object.fromEntries(
    Object.entries(value.reservations).filter(
      ([reservationId, expiresAt]) =>
        RESERVATION_ID_PATTERN.test(reservationId) &&
        typeof expiresAt === 'number' &&
        Number.isFinite(expiresAt) &&
        expiresAt > nowMs,
    ),
  );

  return {
    completed: Math.min(value.completed, DAILY_ANALYSIS_LIMIT),
    day,
    reservations,
  };
}

function usedSlots(state: AllowanceState): number {
  return state.completed + Object.keys(state.reservations).length;
}

export class DailyAnalysisAllowance extends DurableObject<Record<string, never>> {
  async reserve(
    reservationId: string,
    nowMs: number,
  ): Promise<DailyAllowanceReservation> {
    if (!RESERVATION_ID_PATTERN.test(reservationId)) {
      throw new Error('invalid_reservation');
    }

    return this.ctx.storage.transactionSync(() => {
      const state = normalizeState(
        this.ctx.storage.kv.get(ALLOWANCE_STATE_KEY),
        nowMs,
      );
      const existingReservation = state.reservations[reservationId];
      if (existingReservation === undefined) {
        if (usedSlots(state) >= DAILY_ANALYSIS_LIMIT) {
          this.ctx.storage.kv.put(ALLOWANCE_STATE_KEY, state);
          return {
            allowed: false,
            remaining: 0,
            resetAt: nextUtcDay(nowMs),
          };
        }
        state.reservations[reservationId] = nowMs + RESERVATION_TTL_MS;
      }

      this.ctx.storage.kv.put(ALLOWANCE_STATE_KEY, state);
      return {
        allowed: true,
        remaining: Math.max(0, DAILY_ANALYSIS_LIMIT - usedSlots(state)),
        resetAt: nextUtcDay(nowMs),
      };
    });
  }

  async commit(
    reservationId: string,
    nowMs: number,
  ): Promise<DailyAllowanceCommit> {
    return this.ctx.storage.transactionSync(() => {
      const state = normalizeState(
        this.ctx.storage.kv.get(ALLOWANCE_STATE_KEY),
        nowMs,
      );
      const committed = reservationId in state.reservations;
      if (committed) {
        delete state.reservations[reservationId];
        state.completed = Math.min(
          DAILY_ANALYSIS_LIMIT,
          state.completed + 1,
        );
      }

      this.ctx.storage.kv.put(ALLOWANCE_STATE_KEY, state);
      return {
        committed,
        remaining: Math.max(0, DAILY_ANALYSIS_LIMIT - usedSlots(state)),
      };
    });
  }

  async release(reservationId: string, nowMs: number): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      const state = normalizeState(
        this.ctx.storage.kv.get(ALLOWANCE_STATE_KEY),
        nowMs,
      );
      delete state.reservations[reservationId];
      this.ctx.storage.kv.put(ALLOWANCE_STATE_KEY, state);
    });
  }
}
