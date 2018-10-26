import convertUnits from 'css-unit-converter';

function convertNodes(left, right, options) {
  switch (left.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
      return convertAbsoluteLength(left, right, options);
    default:
      return { left, right };
  }
}

function convertAbsoluteLength(left, right, options) {
  if (right.type === left.type) {
    right = {
      type: left.type,
      value: convertUnits(right.value, right.unit, left.unit, options),
      unit: left.unit,
    };
  }
  return { left, right };
}

export default convertNodes;
