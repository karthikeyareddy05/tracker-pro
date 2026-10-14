import type { Collection } from "mongodb";
import type { RateLimitDoc } from "./db.js";

export interface HitResult {
  count: number;
  expiresAt: Date;
}

/**
 * Atomically increments a fixed-window counter stored in MongoDB.
 * Works across multiple server instances. Windows reset after `windowMs`.
 */
export async function hit(
  col: Collection<RateLimitDoc>,
  key: string,
  windowMs: number,
  now: Date,
): Promise<HitResult> {
  const newExpiry = new Date(now.getTime() + windowMs);
  const active = { $gt: ["$expiresAt", now] };
  const doc = await col.findOneAndUpdate(
    { _id: key },
    [
      {
        $set: {
          count: { $cond: [active, { $add: ["$count", 1] }, 1] },
          expiresAt: { $cond: [active, "$expiresAt", newExpiry] },
        },
      },
    ],
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("Rate limit update failed");
  return { count: doc.count, expiresAt: doc.expiresAt };
}

export async function peek(col: Collection<RateLimitDoc>, key: string, now: Date): Promise<RateLimitDoc | null> {
  return col.findOne({ _id: key, expiresAt: { $gt: now } });
}

export function secondsUntil(date: Date, now: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));
}
