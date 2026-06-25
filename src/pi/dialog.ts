import {
  renderStatusText,
  type StatusViewModel,
} from "../ui/status-view-model";

export function renderMlxDialog(status: StatusViewModel): string {
  return renderStatusText(status);
}
