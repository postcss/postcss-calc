import test from 'ava';
import postcss from 'postcss';

import reduceCalc from '../../dist';

const testPlugin = {
  postcssPlugin: 'testplugin',
  Declaration(decl) {
    if (decl.value.startsWith('calc')) {
      decl.value = 'calc(50%-0.5rem)'
    }
  }
}

const processor = postcss([reduceCalc, testPlugin]);

const css = `.item {
  align-self: flex-end;
  flex-basis: calc((100% - 1rem) / 2);
}`;

test('handles a different plugin changing the same declaration', t => {
  t.plan(1);
  return processor.process(css, {from: undefined}).then(result => {
    t.deepEqual(result.css,  `.item {
  align-self: flex-end;
  flex-basis: calc(50% - 0.5rem);
}`);
  });
})
