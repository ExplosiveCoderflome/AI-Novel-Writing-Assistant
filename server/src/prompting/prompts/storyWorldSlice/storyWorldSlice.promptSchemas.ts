import { z } from "zod";

export const storyWorldSliceRawPayloadSchema = z
  .record(z.string(), z.unknown());
