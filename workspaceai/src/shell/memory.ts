// Pure memory helpers — no Electron, no node:fs, no node:path.
// All logic is string-only so it can be unit-tested under Vitest (src/**).

/** Allowed memory entry types. */
export const MEMORY_TYPES = ['user', 'project', 'feedback', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * Returns true only for kebab-case slugs that match /^[a-z0-9][a-z0-9-]*$/.
 * Rejects path traversal (../, /), uppercase, empty strings, and leading dashes.
 */
export function isValidMemoryName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

/**
 * Formats a memory entry file body with YAML frontmatter followed by content.
 *
 * Returns:
 *   ---
 *   name: <name>
 *   description: <description>
 *   metadata:
 *     type: <type>
 *   ---
 *
 *   <content>
 */
export function formatEntry(
  name: string,
  description: string,
  type: string,
  content: string,
): string {
  return `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\n---\n\n${content}`;
}

/**
 * Parses existing index content (bullet lines only), removes any prior entry
 * for the given name, appends the new canonical line, and returns the
 * regenerated index text always ending with '\n'.
 *
 * Non-bullet lines (headings, blank lines, etc.) are dropped so the regenerated
 * index is canonical bullet-only format.
 *
 * Uses U+2014 em-dash (—) as the separator between the link and description,
 * matching the MEMORY.md convention.
 */
export function upsertIndexLine(
  existingIndex: string,
  name: string,
  description: string,
  fileName: string,
): string {
  const lines = existingIndex.split('\n').filter((l) => l.startsWith('- '));
  const prefix = `- [${name}](`;
  const filtered = lines.filter((l) => !l.startsWith(prefix));
  const newLine = `- [${name}](${fileName}) — ${description}`;
  return [...filtered, newLine].join('\n') + '\n';
}

/**
 * Returns the system-prompt Workspace Memory section, or '' when the index
 * content is null or blank (no memory entries yet, or homeFolder unset).
 */
export function buildMemorySection(indexContent: string | null): string {
  if (!indexContent || !indexContent.trim()) return '';
  return `## Workspace Memory\n\n${indexContent.trim()}\n\nUse \`read_memory\` to fetch full entry content when relevant.`;
}
