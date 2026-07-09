export type Node = import("../node.js").Node;
export type BaseType = import("../convertUnits.js").BaseType;
/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../convertUnits.js').BaseType} BaseType */
/**
 * @param {Node[]} args
 * @return {{ values: number[], unit: string } | null}
 */
export function foldConstArgs(args: Node[]): {
    values: number[];
    unit: string;
} | null;
