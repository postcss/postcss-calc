export type TokenType = "number" | "dimension" | "ident" | "punct" | "eof";
export type Token = {
    type: TokenType;
    value: string;
    /**
     * Present on `dimension` tokens; `%` for percentages.
     */
    unit?: string | undefined;
    pos: number;
    /**
     * Whitespace immediately before — drives the §10.1 `+`/`-` rule.
     */
    ws: boolean;
};
/**
 * @param {string} input
 * @return {Token[]}
 */
export function tokenize(input: string): Token[];
