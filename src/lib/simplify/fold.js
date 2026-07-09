'use strict';

// Fold args to a common numeric representation if they share a type.
// Percentages never fold — ordering depends on property-context
// resolution we don't have. Matches csstools.

const { baseOf, convert } = require('../convertUnits.js');

/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../convertUnits.js').BaseType} BaseType */

/**
 * @param {Node[]} args
 * @return {{ values: number[], unit: string } | null}
 */
function foldConstArgs(args) {
  if (args.length === 0) {return null;}

  const first = args[0];
  if (first.type === 'Num') {
    return foldNumberArgs(args);
  }
  if (first.type === 'Dim') {
    const b = first.unit === '%' ? null : baseOf(first.unit);
    if (!b) {return null;}
    return foldDimArgs(args, first.unit, b);
  }
  return null;
}

/**
 * @param {Node[]} args
 * @return {{ values: number[], unit: '' } | null}
 */
function foldNumberArgs(args) {
  /** @type {number[]} */ const values = [];
  for (const a of args) {
    if (a.type !== 'Num') {return null;}
    values.push(a.value);
  }
  return { values, unit: '' };
}

/**
 * @param {Node[]} args
 * @param {string} unit
 * @param {BaseType} base
 * @return {{ values: number[], unit: string } | null}
 */
function foldDimArgs(args, unit, base) {
  /** @type {number[]} */ const values = [];
  for (const a of args) {
    if (a.type !== 'Dim' || a.unit === '%' || baseOf(a.unit) !== base) {
      return null;
    }
    const converted = convert(a.value, a.unit, unit);
    if (converted === null) {return null;}
    values.push(converted);
  }
  return { values, unit };
}

module.exports = { foldConstArgs };
