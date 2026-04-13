import { z } from "zod";

export const worldVisualizationDraftSchema = z.object({
  factionGraph: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string().trim().optional(),
          label: z.string().trim().optional(),
          type: z.string().trim().optional(),
        }),
      ).optional(),
      edges: z.array(
        z.object({
          source: z.string().trim().optional(),
          target: z.string().trim().optional(),
          relation: z.string().trim().optional(),
        }),
      ).optional(),
    })
    .optional(),
  powerTree: z.array(
    z.object({
      level: z.string().trim().optional(),
      description: z.string().trim().optional(),
    }),
  ).optional(),
  geographyMap: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string().trim().optional(),
          label: z.string().trim().optional(),
        }),
      ).optional(),
      edges: z.array(
        z.object({
          source: z.string().trim().optional(),
          target: z.string().trim().optional(),
          relation: z.string().trim().optional(),
        }),
      ).optional(),
    })
    .optional(),
  timeline: z.array(
    z.object({
      year: z.string().trim().optional(),
      event: z.string().trim().optional(),
    }),
  ).optional(),
});

