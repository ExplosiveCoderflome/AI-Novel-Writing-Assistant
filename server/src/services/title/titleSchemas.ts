import { z } from "zod";

export const titleGenerationRawOutputSchema = z.union([
  z.array(z.unknown()),
  z
    .object({
      titles: z.array(z.unknown()),
    })
    .passthrough(),
]);

