import { readFileSync } from 'fs';
import { join } from 'path';

// Knowledge base lives as markdown in src/lib/knowledge/. These files are
// bundled into the serverless function via `outputFileTracingIncludes` in
// next.config.ts (they are read with a dynamic path, so Next cannot trace them
// automatically). Content is cached per module instance after first read.
const DIR = join(process.cwd(), 'src', 'lib', 'knowledge');

function read(name: string): string {
  return readFileSync(join(DIR, `${name}.md`), 'utf8');
}

let voiceCache: string | null = null;
let platformCache: string | null = null;
const briefCache = new Map<string, string | null>();

export function getVoiceGuide(): string {
  if (voiceCache === null) voiceCache = read('_voice-guide');
  return voiceCache;
}

export function getPlatformFacts(): string {
  if (platformCache === null) platformCache = read('_platform');
  return platformCache;
}

/** The per-site brief, or null if no brief file exists for this account id. */
export function getBrief(accountId: string): string | null {
  if (!briefCache.has(accountId)) {
    try {
      briefCache.set(accountId, read(accountId));
    } catch {
      briefCache.set(accountId, null);
    }
  }
  return briefCache.get(accountId) ?? null;
}
