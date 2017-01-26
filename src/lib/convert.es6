import convertUnits from 'css-unit-converter';

function convertNodes(left, right, precision) {
  switch (left.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
      return convertAbsoluteLength(left, right, precision);
    default:
      return {
        left: left,
        right: right
      };
  }
}

function convertAbsoluteLength(left, right, precision) {
  if (right.type === left.type) {
    right = {
      type: left.type,
      value: convertUnits(right.value, right.unit, left.unit, precision),
      unit: left.unit
    };
  }
  return {
    left: left,
    right: right
  };
}

export default convertNodes;
