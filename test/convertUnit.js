'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { convert } = require('../src/lib/convertUnits.js');

// Legacy convertUnit rounded to a precision (default 5) and threw on
// cross-family conversions; convert() returns the raw value and null.
const round = (v, prec) => Math.round(v * 10 ** prec) / 10 ** prec;

test('valid conversions', () => {
  const conversions = [
    // source value, source unit, expected value, target unit
    [10, 'px', 10, 'px'],
    [10, 'px', 0.26458, 'cm'],
    [10, 'px', 2.64583, 'mm'],
    [10, 'px', 10.58333, 'q'],
    [10, 'px', 0.10417, 'in'],
    [10, 'px', 7.5, 'pt'],
    [10, 'px', 0.625, 'pc'],
    [10, 'cm', 377.95276, 'px'],
    [10, 'cm', 10, 'cm'],
    [10, 'cm', 100, 'mm'],
    [10, 'cm', 400, 'q'],
    [10, 'cm', 3.93701, 'in'],
    [10, 'cm', 283.46457, 'pt'],
    [10, 'cm', 23.62205, 'pc'],
    [10, 'mm', 37.79528, 'px'],
    [10, 'mm', 1, 'cm'],
    [10, 'mm', 10, 'mm'],
    [10, 'mm', 40, 'q'],
    [10, 'mm', 0.3937, 'in'],
    [10, 'mm', 28.34646, 'pt'],
    [10, 'mm', 2.3622, 'pc'],
    [10, 'q', 9.44882, 'px'],
    [10, 'q', 0.25, 'cm'],
    [10, 'q', 2.5, 'mm'],
    [10, 'q', 0.09843, 'in'],
    [10, 'q', 7.08661, 'pt'],
    [10, 'q', 0.59055, 'pc'],
    [10, 'in', 960, 'px'],
    [10, 'in', 25.4, 'cm'],
    [10, 'in', 254, 'mm'],
    [10, 'in', 1016, 'q'],
    [10, 'in', 10, 'in'],
    [10, 'in', 720, 'pt'],
    [10, 'in', 60, 'pc'],
    [10, 'pt', 13.33333, 'px'],
    [10, 'pt', 0.35278, 'cm'],
    [10, 'pt', 3.52778, 'mm'],
    [10, 'pt', 14.11111, 'q'],
    [10, 'pt', 0.13889, 'in'],
    [10, 'pt', 10, 'pt'],
    [10, 'pt', 0.83333, 'pc'],
    [10, 'pc', 160, 'px'],
    [10, 'pc', 4.23333, 'cm'],
    [10, 'pc', 42.33333, 'mm'],
    [10, 'pc', 169.33333, 'q'],
    [10, 'pc', 1.66667, 'in'],
    [10, 'pc', 120, 'pt'],
    [10, 'pc', 10, 'pc'],
    [10, 'deg', 10, 'deg'],
    [10, 'deg', 11.11111, 'grad'],
    [10, 'deg', 0.17453, 'rad'],
    [10, 'deg', 0.02778, 'turn'],
    [10, 'grad', 9, 'deg'],
    [10, 'grad', 10, 'grad'],
    [10, 'grad', 0.15708, 'rad'],
    [10, 'grad', 0.025, 'turn'],
    [10, 'rad', 572.9578, 'deg'],
    [10, 'rad', 636.61977, 'grad'],
    [10, 'rad', 10, 'rad'],
    [10, 'rad', 1.59155, 'turn'],
    [10, 'turn', 3600, 'deg'],
    [10, 'turn', 4000, 'grad'],
    [10, 'turn', 62.83185, 'rad'],
    [10, 'turn', 10, 'turn'],
    [10, 's', 10, 's'],
    [10, 's', 10000, 'ms'],
    [10, 'ms', 0.01, 's'],
    [10, 'ms', 10, 'ms'],
    [10, 'Hz', 10, 'Hz'],
    [10, 'Hz', 0.01, 'kHz'],
    [10, 'kHz', 10000, 'Hz'],
    [10, 'kHz', 10, 'kHz'],
    // Resolution rows differ from the legacy convertUnit module, which had
    // these conversions inverted (it claimed 10dpi = 960dppx; 1dppx = 96dpi,
    // so 10dpi = 0.10417dppx).
    [10, 'dpi', 10, 'dpi'],
    [10, 'dpi', 3.93701, 'dpcm'],
    [10, 'dpi', 0.10417, 'dppx'],
    [10, 'dpcm', 25.4, 'dpi'],
    [10, 'dpcm', 10, 'dpcm'],
    [10, 'dpcm', 0.26458, 'dppx'],
    [10, 'dppx', 960, 'dpi'],
    [10, 'dppx', 377.95276, 'dpcm'],
    [10, 'dppx', 10, 'dppx'],
  ];

  conversions.forEach(function (e) {
    const value = e[0];
    const unit = e[1];
    const expected = e[2];
    const targetUnit = e[3];

    const actual = convert(value, unit, targetUnit);
    assert.ok(actual !== null, unit + ' -> ' + targetUnit);
    assert.strictEqual(round(actual, 5), expected, unit + ' -> ' + targetUnit);
  });
});

test('invalid conversions', () => {
  const invalid_units = {
    px: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    cm: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    mm: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    q: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    in: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    pt: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    pc: ['deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    deg: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    grad: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    rad: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    turn: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    s: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    ms: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx'],
    Hz: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'dpi', 'dpcm', 'dppx'],
    kHz: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'dpi', 'dpcm', 'dppx'],
    dpi: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz'],
    dpcm: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz'],
    dppx: ['px', 'cm', 'mm', 'in', 'pt', 'pc', 'deg', 'grad', 'rad', 'turn', 's', 'ms', 'Hz', 'kHz'],
  };

  for (const unit in invalid_units) {
    invalid_units[unit].forEach((targetUnit) => {
      assert.strictEqual(
        convert(10, unit, targetUnit),
        null,
        unit + ' -> ' + targetUnit
      );
    });
  }
});

test('unrounded conversion', () => {
  assert.strictEqual(convert(10, 'px', 'cm'), 0.26458333333333334);
});
