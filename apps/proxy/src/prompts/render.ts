import templates from "./templates/v1.json";

export function renderPrompt(
  name: keyof typeof templates,
  values: Record<string, string | number> = {},
): string {
  return templates[name].join("\n").replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Missing prompt value: ${key}`);
    return String(values[key]);
  });
}
