export type Node = import('./node.js').Node;
export type CalculationType = import('./types.js').CalculationType;
/**
 * @typedef {import('./node.js').Node} Node
 * @typedef {import('./types.js').CalculationType} CalculationType
 */
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeTrig(args: CalculationType[]): CalculationType;
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeInverseTrig(args: CalculationType[]): CalculationType;
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeIdentity(args: CalculationType[]): CalculationType;
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeSign(args: CalculationType[]): CalculationType;
/** @param {CalculationType[]} args @param {Node[]} nodes @return {CalculationType} */
declare function analyzeRound(args: CalculationType[], nodes: Node[]): CalculationType;
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeAtan2(args: CalculationType[]): CalculationType;
/** @param {CalculationType[]} args @return {CalculationType} */
declare function analyzeCalc(args: CalculationType[]): CalculationType;
/** @param {Node} node @return {boolean} */
declare function isRoundStrategy(node: Node): boolean;
/** @param {Node} node @param {number} index @return {boolean} */
declare function isClampKeyword(node: Node, index: number): boolean;
/** @param {CalculationType[]} args @param {Node[]} nodes @return {CalculationType} */
declare function analyzeClamp(args: CalculationType[], nodes: Node[]): CalculationType;
export { analyzeAtan2, analyzeCalc, analyzeClamp, analyzeIdentity, analyzeInverseTrig, analyzeRound, analyzeSign, analyzeTrig, isClampKeyword, isRoundStrategy, };
