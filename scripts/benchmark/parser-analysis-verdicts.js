export function growthVerdict(growth, threshold) {
  let status = 'pass';
  if (growth.some((item) => item.candidateLowerRatio > threshold))
    status = 'regression';
  else if (growth.some((item) => item.candidateUpperRatio > threshold))
    status = 'inconclusive';
  return applyPrecision(status, growth);
}

export function combineStatuses(runtimeStatus, slopeStatus, growthStatus) {
  const statuses = [runtimeStatus, slopeStatus, growthStatus];
  if (statuses.includes('regression')) return 'regression';
  if (statuses.every((item) => item === 'pass')) return 'pass';
  return 'inconclusive';
}
export function applyPrecision(status, endpoints) {
  if (endpoints.length === 0) return status;
  const precise = endpoints.every((endpoint) => endpoint.precision?.targetMet);
  if (precise) return status;
  return 'inconclusive';
}

export function verdict(endpoints, margin, slope = false) {
  if (
    endpoints.some(
      (endpoint) =>
        (slope
          ? endpoint.familyAdjusted95.lower
          : endpoint.familyAdjusted95.lowerRatio) > margin
    )
  )
    return 'regression';
  if (
    endpoints.every(
      (endpoint) =>
        (slope ? endpoint.oneSided95.upper : endpoint.oneSided95.upperRatio) <=
        margin
    )
  )
    return 'pass';
  return 'inconclusive';
}
