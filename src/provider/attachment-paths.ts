import { access } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

export type Attachment = {
  kind: "image";
  path: string;
  displayName: string;
};

export type AdaptAttachmentPathsInput = {
  text: string;
  cwd: string;
  activeEnvironmentSupportsImages: boolean;
  maxImages?: number;
};

export type AdaptedAttachmentRequest = {
  text: string;
  attachments: Attachment[];
  warnings: string[];
};

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function adaptAttachmentPaths({
  text,
  cwd,
  activeEnvironmentSupportsImages,
  maxImages = 4,
}: AdaptAttachmentPathsInput): Promise<AdaptedAttachmentRequest> {
  const candidates = await findExistingImagePaths(text, cwd);

  if (candidates.length === 0) {
    return { text, attachments: [], warnings: [] };
  }

  if (!activeEnvironmentSupportsImages) {
    const warning =
      "[MLX warning: this model is running in an environment that cannot attach image file paths, so image paths were left as text.]";
    return {
      text: `${warning}\n\n${text}`,
      attachments: [],
      warnings: [warning],
    };
  }

  const attached = candidates.slice(0, maxImages);
  const skipped = candidates.slice(maxImages);
  let adaptedText = text;
  const attachments: Attachment[] = [];

  for (const candidate of attached) {
    const displayName = basename(candidate.absolutePath);
    adaptedText = adaptedText.replace(
      candidate.original,
      `[attached image: ${displayName}]`,
    );
    attachments.push({
      kind: "image",
      path: candidate.absolutePath,
      displayName,
    });
  }

  const warnings = skipped.length
    ? [
        `[MLX warning: skipped ${skipped.length} image attachment(s) over the v1 cap of ${maxImages}.]`,
      ]
    : [];

  return {
    text: warnings.length
      ? `${warnings.join("\n")}\n\n${adaptedText}`
      : adaptedText,
    attachments,
    warnings,
  };
}

type CandidatePath = {
  original: string;
  absolutePath: string;
};

async function findExistingImagePaths(
  text: string,
  cwd: string,
): Promise<CandidatePath[]> {
  const paths =
    text.match(/(?:~|\.|\/)?[\w./~-]+\.(?:png|jpe?g|webp)\b/gi) ?? [];
  const candidates: CandidatePath[] = [];

  for (const original of paths) {
    const absolutePath = resolvePath(original, cwd);
    if (!(await exists(absolutePath))) continue;
    candidates.push({ original, absolutePath });
  }

  return candidates;
}

function resolvePath(path: string, cwd: string): string {
  if (path.startsWith("~/")) {
    return join(process.env.HOME ?? "", path.slice(2));
  }
  return isAbsolute(path) ? path : resolve(cwd, path);
}

async function exists(path: string): Promise<boolean> {
  if (!imageExtensions.has(path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "")) {
    return false;
  }

  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
