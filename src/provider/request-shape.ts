import type { RequestShape } from "../models/manifest";
import type { Attachment } from "./attachment-paths";

export type RequestShapeInput = {
  text: string;
  attachments?: Attachment[];
};

export function classifyRequestShape({
  attachments = [],
}: RequestShapeInput): RequestShape {
  return attachments.some((attachment) => attachment.kind === "image")
    ? "image-text-to-text"
    : "text-to-text";
}
