export interface Definition {
  def: string;
  type?: string;
  example?: string[];
  quote?: string[];
  link?: string[];
  synonyms?: string;
  antonyms?: string;
}

export interface Heteronym {
  bopomofo?: string;
  pinyin?: string;
  definitions?: Definition[];
}

export interface BasicEntry {
  title: string;
  radical?: string;
  stroke_count?: number;
  non_radical_stroke_count?: number;
}

export interface DictionaryEntry extends BasicEntry {
  heteronyms: Heteronym[];
}

/** Term type from spreadsheet column "字詞屬性": 1=單字 (single char), 2=複詞 (compound word). */
export type TermType = 1 | 2;

/** A cell from the source spreadsheet, as exposed by SheetJS or xlrd. */
export interface SourceCell {
  value: unknown;
  /** 0 = empty (xlrd XL_CELL_EMPTY semantics). */
  ctype: number;
}

export interface ColumnMap {
  title: number;
  term_type: number;
  radical: number;
  stroke_count: number;
  non_radical_stroke_count: number;
  bopomofo: number;
  pinyin: number;
  synonyms: number;
  antonyms: number;
  definitions: number;
  notes: number;
}
