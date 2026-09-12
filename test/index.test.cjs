'use strict';

const { describe, test } = require('node:test');
const { testValue } = require('./helpers/testValue.js');

describe('Reduce', () => {
  test('should reduce simple calc (1)', testValue('calc(1px + 1px)', '2px'));
  test(
    'should reduce simple calc (2)',
    // `2px+3px` violates §10.1 whitespace → preserved with a warning.
    testValue(
      'calc(1px + 1px);baz:calc(2px+3px)',
      /* '2px;baz:5px' */ '2px;baz:calc(2px+3px)'
    )
  );

  test(
    'should reduce simple calc (3)',
    testValue('calc(1rem * 1.5)', '1.5rem')
  );

  test('should reduce simple calc (4)', testValue('calc(3em - 1em)', '2em'));

  test('should reduce simple calc (5', testValue('calc(2ex / 2)', '1ex'));

  test(
    'should reduce simple calc (6)',
    testValue('calc(50px - (20px - 30px))', '60px')
  );

  test(
    'should reduce simple calc (7)',
    // zero bucket kept for type info (WPT calc-serialization-002).
    testValue('calc(100px - (100px - 100%))', /* '100%' */ 'calc(0px + 100%)')
  );

  test(
    'should reduce simple calc (8)',
    testValue('calc(100px + (100px - 100%))', 'calc(200px - 100%)')
  );

  test(
    'should reduce additions and subtractions (1)',
    testValue('calc(100% - 10px + 20px)', 'calc(100% + 10px)')
  );

  test(
    'should reduce additions and subtractions (2)',
    testValue('calc(100% + 10px - 20px)', 'calc(100% - 10px)')
  );

  test(
    'should reduce additions and subtractions (3)',
    testValue('calc(1px - (2em + 3%))', 'calc(1px - 2em - 3%)')
  );

  test(
    'should reduce additions and subtractions (4)',
    testValue('calc((100vw - 50em) / 2)', 'calc(50vw - 25em)')
  );

  test(
    'should reduce additions and subtractions (5)',
    testValue('calc(10px - (100vw - 50em) / 2)', 'calc(10px - 50vw + 25em)')
  );

  test(
    'should reduce additions and subtractions (6)',
    testValue('calc(1px - (2em + 4vh + 3%))', 'calc(1px - 2em - 4vh - 3%)')
  );

  test(
    'should reduce additions and subtractions (7)',
    // reciprocal + canonical coefficient-first order.
    testValue(
      'calc(0px - (24px - (var(--a) - var(--b)) / 2 + var(--c)))',
      'calc(0px - (24px - .5 * (var(--a) - var(--b)) + var(--c)))'
    )
  );

  test(
    'should reduce additions and subtractions (8)',
    testValue('calc(1px + (2em + (3vh + 4px)))', 'calc(5px + 2em + 3vh)')
  );

  test(
    'should reduce additions and subtractions (9)',
    testValue('calc(1px - (2em + 4px - 6vh) / 2)', 'calc(-1px - 1em + 3vh)')
  );

  test(
    'should reduce multiplication',
    // constant fold `2*2 → 4`; coefficient first.
    testValue('calc(((var(--a) + 4px) * 2) * 2)', 'calc(4 * (4px + var(--a)))')
  );

  test(
    'should reduce multiplication before reducing additions',
    // constant fold `2*2 → 4`; canonical order.
    testValue(
      'calc(((var(--a) + 4px) * 2) * 2 + 4px)',
      'calc(4px + 4 * (4px + var(--a)))'
    )
  );

  test(
    'should reduce division',
    // constant fold `1/2/2 → .25` + reciprocal; coefficient first.
    testValue(
      'calc(((var(--a) + 4px) / 2) / 2)',
      'calc(.25 * (4px + var(--a)))'
    )
  );

  test(
    'should reduce division before reducing additions',
    // constant fold + reciprocal; canonical order.
    testValue(
      'calc(((var(--a) + 4px) / 2) / 2 + 4px)',
      'calc(4px + .25 * (4px + var(--a)))'
    )
  );
});

describe('Ignore', () => {
  test(
    'should ignore value surrounding calc function (1)',
    testValue('a calc(1px + 1px)', 'a 2px')
  );

  test(
    'should ignore value surrounding calc function (2)',
    testValue('calc(1px + 1px) a', '2px a')
  );

  test(
    'should ignore value surrounding calc function (3)',
    testValue('a calc(1px + 1px) b', 'a 2px b')
  );

  test(
    'should ignore value surrounding calc function (4)',
    testValue('a calc(1px + 1px) b calc(1em + 2em) c', 'a 2px b 3em c')
  );
});

describe('Reduce', () => {
  test('should reduce uppercase calc (1)', testValue('CALC(1px + 1px)', '2px'));

  test(
    'should reduce uppercase calc (2)',
    testValue('CALC(1px + CALC(2px / 2))', '2px')
  );

  test(
    'should reduce uppercase calc (3)',
    testValue('-WEBKIT-CALC(1px + 1px)', '2px')
  );

  test(
    'should reduce uppercase calc (4)',
    testValue('-WEBKIT-CALC(1px + -WEBKIT-CALC(2px / 2))', '2px')
  );
});
