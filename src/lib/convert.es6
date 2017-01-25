import convertUnits from 'css-unit-converter';

function convertNodes(left, right) {
  switch (left.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
      return convertAbsoluteLength(left, right);
    default:
      return {
        left: left,
        right: right
      };
  }
}

function convertAbsoluteLength(left, right) {
  if (right.type === left.type) {
    right = {
      type: left.type,
      value: convertUnits(right.value, right.unit, left.unit),
      unit: left.unit
    };
  }
  return {
    left: left,
    right: right
  };
}

export default convertNodes;
