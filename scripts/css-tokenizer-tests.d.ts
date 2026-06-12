// @rmenke/css-tokenizer-tests ships no types.
declare module '@rmenke/css-tokenizer-tests' {
  export interface SuiteToken {
    type: string;
    raw: string;
    startIndex: number;
    endIndex: number;
    structured: { value?: number | string; unit?: string; type?: string } | null;
  }
  export interface SuiteCase {
    css: string;
    tokens: SuiteToken[];
  }
  export const testCorpus: Record<string, SuiteCase>;
}
