import { describe, test } from 'node:test';
import { testValue } from '../helpers/testValue.js';

describe('Nested calc functions', () => {
  test(
    'should reduce nested calc',
    testValue('calc(100% - calc(50% + 25px))', 'calc(50% - 25px)')
  );

  test(
    'should reduce vendor-prefixed nested calc',
    testValue(
      '-webkit-calc(100% - -webkit-calc(50% + 25px))',
      '-webkit-calc(50% - 25px)'
    )
  );

  test(
    'should handle nested calc function (#1)',
    testValue(
      'calc(calc(var(--foo) + var(--bar)) + var(--baz))',
      'calc(var(--foo) + var(--bar) + var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#2)',
    testValue(
      'calc(var(--foo) + calc(var(--bar) + var(--baz)))',
      'calc(var(--foo) + var(--bar) + var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#3)',
    testValue(
      'calc(calc(var(--foo) - var(--bar)) - var(--baz))',
      'calc(var(--foo) - var(--bar) - var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#4)',
    testValue(
      'calc(var(--foo) - calc(var(--bar) - var(--baz)))',
      'calc(var(--foo) - var(--bar) + var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#5)',
    testValue(
      'calc(calc(var(--foo) + var(--bar)) - var(--baz))',
      'calc(var(--foo) + var(--bar) - var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#6)',
    testValue(
      'calc(var(--foo) + calc(var(--bar) - var(--baz)))',
      'calc(var(--foo) + var(--bar) - var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#7)',
    testValue(
      'calc(calc(var(--foo) - var(--bar)) + var(--baz))',
      'calc(var(--foo) - var(--bar) + var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#8)',
    testValue(
      'calc(var(--foo) - calc(var(--bar) + var(--baz)))',
      'calc(var(--foo) - var(--bar) - var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#9)',
    // spec-style spaces around `*`.
    testValue(
      'calc(calc(var(--foo) + var(--bar)) * var(--baz))',
      /* 'calc((var(--foo) + var(--bar))*var(--baz))' */ 'calc((var(--foo) + var(--bar)) * var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#10)',
    // spec-style spaces around `*`.
    testValue(
      'calc(var(--foo) * calc(var(--bar) + var(--baz)))',
      /* 'calc(var(--foo)*(var(--bar) + var(--baz)))' */ 'calc(var(--foo) * (var(--bar) + var(--baz)))'
    )
  );

  test(
    'should handle nested calc function (#11)',
    // spec-style spaces around `/`.
    testValue(
      'calc(calc(var(--foo) + var(--bar)) / var(--baz))',
      /* 'calc((var(--foo) + var(--bar))/var(--baz))' */ 'calc((var(--foo) + var(--bar)) / var(--baz))'
    )
  );

  test(
    'should handle nested calc function (#12)',
    // spec-style spaces around `/`.
    testValue(
      'calc(var(--foo) / calc(var(--bar) + var(--baz)))',
      /* 'calc(var(--foo)/(var(--bar) + var(--baz)))' */ 'calc(var(--foo) / (var(--bar) + var(--baz)))'
    )
  );

  test(
    'should handle nested calc function (#13)',
    testValue(
      'calc(100vh - 5rem - calc(10rem + 100px))',
      'calc(100vh - 15rem - 100px)'
    )
  );

  test(
    'should handle nested calc function (#14)',
    testValue('calc(100% - calc(10px + 2vw))', 'calc(100% - 10px - 2vw)')
  );

  test(
    'should handle nested calc function (#15)',
    testValue('calc(100% - calc(10px - 2vw))', 'calc(100% - 10px + 2vw)')
  );
});
