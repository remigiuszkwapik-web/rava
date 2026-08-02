import { buildActivity } from "../analysis/build";
import type { Activity, ContextAnswers, ParsedActivity, Profile, SourceKind } from "../model";
import { parseBytes, parseFile } from "../parse";
import { findDuplicate, putActivity } from "../state/db";

export interface IngestResult {
  added: number;
  duplicates: number;
  failed: number;
  last?: Activity;
}

async function storeParsed(
  list: ParsedActivity[],
  profile: Profile,
  opts: { context?: ContextAnswers; source?: SourceKind; keepRaw?: ArrayBuffer },
): Promise<IngestResult> {
  const res: IngestResult = { added: 0, duplicates: 0, failed: 0 };
  for (const parsed of list) {
    try {
      const act = buildActivity(parsed, profile, {
        context: opts.context,
        source: opts.source,
        keepRaw: list.length === 1 ? opts.keepRaw : undefined,
      });
      const dup = await findDuplicate(
        profile.id,
        act.startTime,
        act.metrics.durationTotalS,
      );
      if (dup) {
        res.duplicates++;
        continue;
      }
      await putActivity(act);
      res.added++;
      res.last = act;
    } catch {
      res.failed++;
    }
  }
  return res;
}

/** Nutzerdatei (FIT/GPX/TCX/gz/ZIP) importieren. */
export async function ingestFile(
  file: File,
  profile: Profile,
  opts: {
    context?: ContextAnswers;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<IngestResult> {
  const isZip = file.name.toLowerCase().endsWith(".zip");
  const raw = isZip ? undefined : await file.arrayBuffer();
  const { activities, failed } = await parseFile(file, opts.onProgress);
  const source: SourceKind | undefined = isZip ? "strava-zip" : undefined;
  const result = await storeParsed(activities, profile, {
    context: opts.context,
    source,
    keepRaw: raw,
  });
  result.failed += failed;
  return result;
}

/** Von Dropbox geholte Dateien importieren. */
export async function ingestDropboxFiles(
  files: { name: string; bytes: Uint8Array }[],
  profile: Profile,
): Promise<IngestResult> {
  const parsed: ParsedActivity[] = [];
  let failed = 0;
  for (const f of files) {
    try {
      parsed.push(await parseBytes(f.name, f.bytes));
    } catch {
      failed++;
    }
  }
  const result = await storeParsed(parsed, profile, { source: "dropbox" });
  result.failed += failed;
  return result;
}
