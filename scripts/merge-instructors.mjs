/**
 * @file merge-instructors.mjs
 * Merges a MyScheduler harvest (see harvest-instructors.js) into the bundled
 * data files.
 *
 *   node scripts/merge-instructors.mjs ~/Downloads/harvest-2026-Fall-Quarter.json
 *   node scripts/merge-instructors.mjs --dry-run <file>   # report only
 *
 * Writes two files:
 *
 *   public/data/prof_uids.json    "Last,F." -> CruzID     (existing shape)
 *   public/data/instructors.json  richer index            (new)
 *
 * MERGES ARE ADDITIVE. Instructors only teach some quarters, and MyScheduler
 * only serves terms that are currently open for enrollment — past terms return
 * zero subjects, so history cannot be backfilled. Running this once per term
 * accumulates coverage instead, and nothing is ever dropped.
 *
 * CONFLICTS ARE NOT GUESSED. Two professors can share a last name and first
 * initial (Dongwook Lee / David Lee both key to "Lee,D."). Where that happens
 * this script leaves any existing prof_uids entry untouched and records the
 * clash, because silently overwriting would just move the wrong answer around.
 * Disambiguation is instead published in instructors.json under a subject-
 * qualified key, which the resolver consults first.
 *
 * Pass `--verify` to separate two very different things that both surface as a
 * clash:
 *
 *   misfiled     the existing uid belongs to someone whose name does not key to
 *                this entry at all ("Chen,B." -> shaowei, who is Shaowei Chen).
 *                A plain bug; the harvest's uid replaces it.
 *   ambiguous    both people really do key here (dabjones = Daryl Jones and
 *                deljones = Derrick Jones both key to "Jones,D."). Left alone.
 *
 * Telling them apart needs the one fact neither file holds — the existing uid's
 * real name — so --verify looks it up in the campus directory, one request per
 * clashing key. Anything it cannot verify is left untouched.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIDS_PATH = resolve(repoRoot, 'public/data/prof_uids.json');
const INSTRUCTORS_PATH = resolve(repoRoot, 'public/data/instructors.json');

/** Generational suffixes that must not be mistaken for a last name. */
const SUFFIXES = new Set([
  'jr',
  'jr.',
  'sr',
  'sr.',
  'ii',
  'iii',
  'iv',
  'v',
  'phd',
  'ph.d.',
  'md',
]);

/**
 * Derives the abbreviated "Last,F." key used by prof_uids.json from a full
 * name. Returns null when the name has too few parts to key reliably.
 */
export function toAbbreviatedKey(fullName) {
  if (!fullName) return null;
  const tokens = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !SUFFIXES.has(token.toLowerCase()));
  if (tokens.length < 2) return null;

  const last = tokens[tokens.length - 1];
  const firstInitial = tokens[0].charAt(0).toUpperCase();
  if (!last || !firstInitial) return null;
  return `${last},${firstInitial}.`;
}

/** Lowercased "last,f" form used for subject-qualified lookup keys. */
function toLookupKey(fullName) {
  const abbreviated = toAbbreviatedKey(fullName);
  return abbreviated ? abbreviated.slice(0, -1).toLowerCase() : null;
}

/** Existing prof_uids values may be a bare uid or a URL containing `uid=...`. */
function extractUid(value) {
  const text = String(value ?? '');
  const match = text.match(/uid=([\w-]+)/);
  if (match) return match[1].toLowerCase();
  return text.includes('http') ? null : text.toLowerCase();
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const DIRECTORY_UID_URL = 'https://campusdirectory.ucsc.edu/api/uid/';

/**
 * Looks up a CruzID's real name in the campus directory. Returns null when the
 * uid has no public record (people who have left, or who suppress their entry),
 * which callers must treat as "unknown", never as "wrong".
 */
async function lookupDirectoryName(uid) {
  try {
    const res = await fetch(`${DIRECTORY_UID_URL}${encodeURIComponent(uid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const name = data?.ucscpersonpubcn?.[0] || data?.cn?.[0];
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Splits clashes into misfiled entries (safe to correct) and genuine shared
 * keys (must be left alone), by asking the directory who the existing uid
 * actually is.
 */
async function classifyConflicts(conflicts) {
  const misfiled = [];
  const ambiguous = [];
  const unverifiable = [];

  for (const clash of conflicts) {
    const actualName = await lookupDirectoryName(clash.kept);
    if (!actualName) {
      unverifiable.push(clash);
      continue;
    }
    const actualKey = toAbbreviatedKey(actualName);
    if (actualKey && actualKey.toLowerCase() === clash.key.toLowerCase()) {
      ambiguous.push({ ...clash, actualName });
    } else {
      misfiled.push({ ...clash, actualName, actualKey });
    }
  }

  return { misfiled, ambiguous, unverifiable };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const harvestPath = args.find((arg) => !arg.startsWith('--'));

  if (!harvestPath) {
    console.error(
      'usage: node scripts/merge-instructors.mjs [--dry-run] [--verify] <harvest.json>'
    );
    process.exit(1);
  }

  const harvest = JSON.parse(readFileSync(resolve(harvestPath), 'utf8'));
  if (!harvest.instructors) {
    console.error('Not a harvest file: missing `instructors`.');
    process.exit(1);
  }

  const uids = readJson(UIDS_PATH, {});
  const instructors = readJson(INSTRUCTORS_PATH, {
    generatedAt: null,
    terms: [],
    byUid: {},
    bySubjectName: {},
  });

  // ── Fold the harvest into the accumulated byUid index ──
  let newInstructors = 0;
  for (const [uid, entry] of Object.entries(harvest.instructors)) {
    const existing = instructors.byUid[uid];
    if (!existing) {
      instructors.byUid[uid] = {
        name: entry.name,
        subjects: [...entry.subjects].sort(),
      };
      newInstructors++;
      continue;
    }
    // Keep the fullest spelling and the union of subjects across terms.
    if (entry.name && entry.name.length > existing.name.length) {
      existing.name = entry.name;
    }
    existing.subjects = [
      ...new Set([...existing.subjects, ...entry.subjects]),
    ].sort();
  }

  // ── Rebuild the subject-qualified index from the accumulated data ──
  // Built fresh each run so that a name correction cannot leave a stale key
  // behind. Keys map "SUBJ|last,f" -> uid; a key claimed by two different
  // people is deleted rather than resolved arbitrarily.
  const bySubjectName = {};
  const contested = new Set();
  for (const [uid, entry] of Object.entries(instructors.byUid)) {
    const lookup = toLookupKey(entry.name);
    if (!lookup) continue;
    for (const subject of entry.subjects) {
      const key = `${subject}|${lookup}`;
      if (key in bySubjectName && bySubjectName[key] !== uid) {
        contested.add(key);
        continue;
      }
      bySubjectName[key] = uid;
    }
  }
  for (const key of contested) delete bySubjectName[key];
  instructors.bySubjectName = bySubjectName;

  // ── Fold into prof_uids.json, never overwriting an existing entry ──
  let addedUids = 0;
  const conflicts = [];
  for (const [uid, entry] of Object.entries(harvest.instructors)) {
    const key = toAbbreviatedKey(entry.name);
    if (!key) continue;

    if (!(key in uids)) {
      uids[key] = uid;
      addedUids++;
      continue;
    }
    const existingUid = extractUid(uids[key]);
    if (existingUid && existingUid !== uid) {
      conflicts.push({
        key,
        kept: existingUid,
        alsoSeen: uid,
        name: entry.name,
      });
    }
  }

  if (harvest.term && !instructors.terms.includes(harvest.term)) {
    instructors.terms.push(harvest.term);
    instructors.terms.sort();
  }
  instructors.generatedAt = new Date().toISOString();

  // ── Report ──
  console.log(`harvest term:        ${harvest.term}`);
  console.log(
    `harvest instructors: ${Object.keys(harvest.instructors).length}`
  );
  console.log(`new to instructors:  ${newInstructors}`);
  console.log(`new prof_uids keys:  ${addedUids}`);
  console.log(`prof_uids total:     ${Object.keys(uids).length}`);
  console.log(`subject-qualified:   ${Object.keys(bySubjectName).length} keys`);
  console.log(`contested keys:      ${contested.size} (dropped, unresolvable)`);

  if (conflicts.length && !verify) {
    console.log(
      `\n${conflicts.length} "Last,F." clash(es) — existing entry kept, ` +
        `subject index disambiguates. Re-run with --verify to separate ` +
        `misfiled entries from genuine shared keys:`
    );
    for (const clash of conflicts) {
      console.log(
        `  ${clash.key.padEnd(18)} kept ${clash.kept} · also ${clash.alsoSeen} (${clash.name})`
      );
    }
  }

  let corrected = 0;
  if (conflicts.length && verify) {
    console.log(
      `\nverifying ${conflicts.length} clash(es) against the campus directory...`
    );
    const { misfiled, ambiguous, unverifiable } =
      await classifyConflicts(conflicts);

    if (misfiled.length) {
      console.log(`\n${misfiled.length} MISFILED — corrected:`);
      for (const clash of misfiled) {
        uids[clash.key] = clash.alsoSeen;
        corrected++;
        console.log(
          `  ${clash.key.padEnd(18)} ${clash.kept} is "${clash.actualName}" ` +
            `-> now ${clash.alsoSeen} (${clash.name})`
        );
        // Re-file the displaced uid under the key it should have had, but only
        // into a vacant slot — anything else would start a new conflict.
        if (clash.actualKey && !(clash.actualKey in uids)) {
          uids[clash.actualKey] = clash.kept;
          console.log(
            `  ${''.padEnd(18)} re-filed ${clash.kept} under ${clash.actualKey}`
          );
        }
      }
    }

    if (ambiguous.length) {
      console.log(`\n${ambiguous.length} GENUINELY AMBIGUOUS — left as-is:`);
      for (const clash of ambiguous) {
        console.log(
          `  ${clash.key.padEnd(18)} ${clash.kept} "${clash.actualName}" ` +
            `vs ${clash.alsoSeen} "${clash.name}"`
        );
      }
    }

    if (unverifiable.length) {
      console.log(
        `\n${unverifiable.length} UNVERIFIABLE (no public directory record) — left as-is:`
      );
      for (const clash of unverifiable) {
        console.log(`  ${clash.key.padEnd(18)} kept ${clash.kept}`);
      }
    }
  }

  if (corrected) console.log(`\ncorrected ${corrected} misfiled entr(ies).`);

  if (dryRun) {
    console.log('\n--dry-run: no files written.');
    return;
  }

  const sortedUids = Object.fromEntries(
    Object.entries(uids).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(UIDS_PATH, `${JSON.stringify(sortedUids, null, 2)}\n`);
  writeFileSync(INSTRUCTORS_PATH, `${JSON.stringify(instructors, null, 2)}\n`);
  console.log(`\nwrote ${UIDS_PATH}`);
  console.log(`wrote ${INSTRUCTORS_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
