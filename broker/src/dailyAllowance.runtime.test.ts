import { env } from 'cloudflare:workers';
import { evictDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('daily analysis allowance in the Workers runtime', () => {
  it('coordinates concurrent reservations and preserves committed usage after eviction', async () => {
    const objectName = `runtime-${crypto.randomUUID()}`;
    const allowance = env.DAILY_ALLOWANCE.getByName(objectName);
    const firstDay = Date.parse('2026-08-09T12:00:00.000Z');
    const reservationIds = [
      'runtime-reservation-0001',
      'runtime-reservation-0002',
      'runtime-reservation-0003',
      'runtime-reservation-0004',
    ];

    const firstThree = await Promise.all(
      reservationIds
        .slice(0, 3)
        .map((reservationId) => allowance.reserve(reservationId, firstDay)),
    );
    expect(firstThree.every((result) => result.allowed)).toBe(true);
    await expect(
      allowance.reserve(reservationIds[3], firstDay),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });

    await allowance.release(reservationIds[2], firstDay);
    await expect(
      allowance.reserve(reservationIds[3], firstDay),
    ).resolves.toMatchObject({ allowed: true });
    await Promise.all([
      allowance.commit(reservationIds[0], firstDay),
      allowance.commit(reservationIds[1], firstDay),
      allowance.commit(reservationIds[3], firstDay),
    ]);

    await evictDurableObject(allowance);
    const reloadedAllowance = env.DAILY_ALLOWANCE.getByName(objectName);
    await expect(
      reloadedAllowance.reserve('runtime-reservation-0005', firstDay),
    ).resolves.toMatchObject({ allowed: false });

    const nextDay = Date.parse('2026-08-10T00:00:01.000Z');
    await expect(
      reloadedAllowance.reserve('runtime-reservation-0005', nextDay),
    ).resolves.toMatchObject({ allowed: true, remaining: 2 });
  });
});
