const piModelPrefix = "mlx/";

export type ModelReference = {
  piModelId: string;
  huggingFaceId: string;
};

export function parseModelReference(input: string): ModelReference {
  const huggingFaceId = input.startsWith(piModelPrefix)
    ? input.slice(piModelPrefix.length)
    : input;

  return {
    piModelId: `${piModelPrefix}${huggingFaceId}`,
    huggingFaceId,
  };
}

export function toSafeModelId(huggingFaceId: string): string {
  return huggingFaceId.replaceAll("/", "--");
}
