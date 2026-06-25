const rootSuggestions = [
  "status",
  "init ",
  "start ",
  "stop",
  "logs",
  "reprobe ",
  "context ",
  "tokens ",
  "max-tokens ",
  "runtime ",
  "max ",
];

const initSuggestions = ["lm", "vlm", "optiq", "--all"];
const maxSuggestions = ["memory ", "models ", "context ", "tokens ", "output "];

export function completeMlxCommand(input: string): string[] {
  if (input === "/mlx ") {
    return rootSuggestions;
  }

  if (input === "/mlx init" || input === "/mlx init ") {
    return initSuggestions;
  }

  if (input === "/mlx max" || input === "/mlx max ") {
    return maxSuggestions;
  }

  return [];
}
