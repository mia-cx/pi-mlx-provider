export type HfFile = { rfilename?: string };

export type HfMetadata = {
  modelId: string;
  resolvedRevision: string;
  requestedRevision?: string;
  readme: string;
  files: string[];
  tags: string[];
  pipelineTag?: string;
  libraryName?: string;
  approximateSizeBytes?: number;
};

export type FetchHfMetadataOptions = {
  fetch?: typeof fetch;
  endpoint?: string;
};

export async function fetchHfMetadata(
  modelId: string,
  {
    fetch: fetchImpl = fetch,
    endpoint = "https://huggingface.co",
  }: FetchHfMetadataOptions = {},
): Promise<HfMetadata> {
  const apiUrl = `${endpoint}/api/models/${modelId}`;
  const apiResponse = await fetchImpl(apiUrl);
  if (!apiResponse.ok)
    throw new Error(`Failed to fetch Hugging Face metadata for ${modelId}`);
  const api = (await apiResponse.json()) as {
    sha?: string;
    siblings?: HfFile[];
    tags?: string[];
    pipeline_tag?: string;
    library_name?: string;
    safetensors?: { total?: number };
  };

  const readmeResponse = await fetchImpl(
    `${endpoint}/${modelId}/raw/main/README.md`,
  );
  const readme = readmeResponse.ok ? await readmeResponse.text() : "";

  return {
    modelId,
    resolvedRevision: api.sha ?? "main",
    readme,
    files: (api.siblings ?? []).flatMap((file) => file.rfilename ?? []),
    tags: api.tags ?? [],
    ...(api.pipeline_tag ? { pipelineTag: api.pipeline_tag } : {}),
    ...(api.library_name ? { libraryName: api.library_name } : {}),
    ...(api.safetensors?.total
      ? { approximateSizeBytes: api.safetensors.total }
      : {}),
  };
}
