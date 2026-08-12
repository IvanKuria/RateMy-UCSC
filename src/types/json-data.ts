/**
 * Shapes of the bundled JSON data files in public/data.
 */

/** Abbreviated "Last,F." name -> a value containing `uid=...` or a bare uid. */
export type ProfUidsMap = Record<string, string>;

/** Full professor name -> free-text research description. */
export type ResearchTopicsMap = Record<string, string>;

/** Professor name -> list of course strings. */
export type ClassesMap = Record<string, string[]>;

/** One harvested instructor: their fullest known name and the subjects they teach. */
export interface InstructorEntry {
  name: string;
  subjects: string[];
}

/**
 * `public/data/instructors.json` — built by scripts/merge-instructors.mjs from
 * MyScheduler harvests, which carry each instructor's email and therefore their
 * exact CruzID.
 *
 * `bySubjectName` is the part that earns its keep: it keys on "SUBJ|last,f"
 * (e.g. "AM|lee,d"), which separates professors that "Last,F." alone cannot.
 * Keys claimed by two different people are omitted rather than guessed.
 */
export interface InstructorsIndex {
  generatedAt: string | null;
  terms: string[];
  byUid: Record<string, InstructorEntry>;
  bySubjectName: Record<string, string>;
  /**
   * Term -> class number -> CruzID.
   *
   * The exact-identity path for MyUCSC, whose pages abbreviate instructors to
   * "K. Obraczka" but do print the class number. Nested by term because class
   * numbers are only unique within one.
   */
  byTermClassNumber: Record<string, Record<string, string>>;
}
