import { z } from "zod";

export const uuidSchema = z.string().uuid();

/** Cursor pagination — preferred over offset for feeds that change often. */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const offsetPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginatedResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
      total: z.number().int().nonnegative().optional(),
    }),
  });
}

/**
 * Nepal administrative hierarchy (spec section 5). Kept as free-form strings
 * plus coordinates so the same shape works when the platform expands beyond
 * Nepal.
 */
export const locationSchema = z.object({
  country: z.string().length(2).default("NP"),
  province: z.string().min(1).nullable(),
  district: z.string().min(1).nullable(),
  municipality: z.string().min(1).nullable(),
  area: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});

export type Location = z.infer<typeof locationSchema>;

/** Radius search around a point, used by pet, vet and shop discovery. */
export const geoQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(500).default(25),
});

export const languageSchema = z.enum(["en", "ne"]);

export const mediaKind = z.enum(["IMAGE", "VIDEO", "DOCUMENT"]);

export const mediaSchema = z.object({
  id: uuidSchema,
  kind: mediaKind,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  position: z.number().int().nonnegative(),
});

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  uptimeSeconds: z.number(),
  checks: z.record(z.enum(["ok", "fail"])).optional(),
});
