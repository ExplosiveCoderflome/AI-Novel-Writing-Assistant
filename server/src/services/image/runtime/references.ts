import type { GeneratedReferenceImageMeta } from "./types";

interface FilterImageGenerationReferencesInput {
  refImagePaths?: string[];
  refImages?: string[];
  referenceImages?: GeneratedReferenceImageMeta[];
  excludedReferenceImageUrls?: string[];
}

export function filterImageGenerationReferences(input: FilterImageGenerationReferencesInput) {
  const excludedUrls = new Set(
    (input.excludedReferenceImageUrls ?? [])
      .map((url) => url.trim())
      .filter(Boolean),
  );
  if (excludedUrls.size === 0) {
    return {
      refImagePaths: input.refImagePaths,
      refImages: input.refImages,
      referenceImages: input.referenceImages,
    };
  }

  const referenceImages = input.referenceImages ?? [];
  const keepIndexes = referenceImages
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref }) => !excludedUrls.has(ref.url))
    .map(({ index }) => index);

  if (referenceImages.length === 0) {
    const refImages = input.refImages?.filter((url) => !excludedUrls.has(url));
    return {
      refImagePaths: input.refImagePaths,
      refImages,
      referenceImages,
    };
  }

  return {
    refImagePaths: input.refImagePaths?.filter((_, index) => keepIndexes.includes(index)),
    refImages: input.refImages?.filter((_, index) => keepIndexes.includes(index)),
    referenceImages: referenceImages.filter((_, index) => keepIndexes.includes(index)),
  };
}
