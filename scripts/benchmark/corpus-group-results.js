/* oxlint-disable no-bitwise */
import { stableHash } from '../lib/corpus-policy.js';
import {
  BOOTSTRAP_RESAMPLES,
  bootstrapPairedReplicateInterval,
  CORPUS_INTERVAL_METHOD,
  median,
  ordinaryInterval,
  variationMetrics,
} from './benchmark.js';

export function groupResults(
  replicates,
  seed = 0,
  resamples = BOOTSTRAP_RESAMPLES
) {
  const groups = new Map();
  for (const replicate of replicates)
    for (const batch of replicate.batches)
      for (const measurement of batch.measurements) {
        const key = measurement.group;
        if (!Number.isInteger(replicate.replicate))
          throw new TypeError('corpus worker omitted its replicate number');
        const values = groups.get(key) ?? [];
        values.push({
          replicate: replicate.replicate,
          order: batch.order,
          ours: measurement.ours.ms,
          reference: measurement.reference.ms,
          oursChecksum: measurement.ours.checksum,
          referenceChecksum: measurement.reference.checksum,
        });
        groups.set(key, values);
      }
  const result = {};
  for (const [group, values] of groups) {
    const byReplicate = new Map();
    for (const value of values) {
      const current = byReplicate.get(value.replicate) ?? {
        ours: [],
        reference: [],
        checksums: [],
        byOrder: { 'ours-first': [], 'reference-first': [] },
      };
      current.ours.push(value.ours);
      current.reference.push(value.reference);
      current.checksums.push([value.oursChecksum, value.referenceChecksum]);
      current.byOrder[value.order].push(value);
      byReplicate.set(value.replicate, current);
    }
    const replicatePairs = [...byReplicate.values()].map((value) => {
      const orderRatios = ['ours-first', 'reference-first'].map((order) => {
        const measurements = value.byOrder[order];
        if (measurements.length === 0)
          throw new RangeError(
            `corpus replicate omitted ${order} measurements`
          );
        return (
          median(measurements.map((item) => item.ours)) /
          median(measurements.map((item) => item.reference))
        );
      });
      return orderRatios;
    });
    const ratios = replicatePairs.map(([oursFirst, referenceFirst]) =>
      Math.exp((Math.log(oursFirst) + Math.log(referenceFirst)) / 2)
    );
    const logs = ratios.map(Math.log);
    const ordinary = ordinaryInterval(logs);
    const groupSeed =
      (seed ^ Number.parseInt(stableHash(group).slice(0, 8), 16)) >>> 0;
    const byOrder = {};
    for (const [orderIndex, order] of [
      'ours-first',
      'reference-first',
    ].entries()) {
      const orderRatios = replicatePairs.map((pair) => pair[orderIndex]);
      const orderInterval = ordinaryInterval(orderRatios.map(Math.log));
      byOrder[order] = {
        replicates: orderRatios.length,
        ratios: orderRatios,
        geometricMeanPairedRuntimeRatio: Math.exp(orderInterval.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderInterval.lower),
          upperRatio: Math.exp(orderInterval.upper),
        },
      };
    }
    const oursFirst = byOrder['ours-first'].ratios;
    const referenceFirst = byOrder['reference-first'].ratios;
    const pairedOrderLogs = oursFirst.map((ratio, index) =>
      Math.log(referenceFirst[index] / ratio)
    );
    const orderEffect = ordinaryInterval(pairedOrderLogs);
    const bootstrap = bootstrapPairedReplicateInterval(
      replicatePairs.map((pair) => pair.map(Math.log)),
      groupSeed,
      resamples,
      0.95
    );
    result[group] = {
      replicates: ratios.length,
      geometricMeanPairedRuntimeRatio: Math.exp(ordinary.mean),
      ordinary95: {
        lowerRatio: Math.exp(ordinary.lower),
        upperRatio: Math.exp(ordinary.upper),
      },
      bootstrap95: {
        lowerRatio: Math.exp(bootstrap.lower),
        upperRatio: Math.exp(bootstrap.upper),
        resamples: bootstrap.resamples,
      },
      bootstrap90: (() => {
        const interval = bootstrapPairedReplicateInterval(
          replicatePairs.map((pair) => pair.map(Math.log)),
          (groupSeed ^ 0x9e3779b9) >>> 0,
          resamples,
          0.9
        );
        return {
          lowerRatio: Math.exp(interval.lower),
          upperRatio: Math.exp(interval.upper),
          resamples: interval.resamples,
        };
      })(),
      bootstrapSeed: groupSeed,
      bootstrapMethod: CORPUS_INTERVAL_METHOD,
      byOrder,
      orderEffect: {
        logRatio: orderEffect.mean,
        ratio: Math.exp(orderEffect.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderEffect.lower),
          upperRatio: Math.exp(orderEffect.upper),
        },
      },
      withinProcessBatchVariation: withinProcessVariation(values),
      betweenProcessVariation: variationMetrics(ratios),
      ratios,
      checksums: [
        ...new Set(
          values.flatMap((value) => [
            value.oursChecksum,
            value.referenceChecksum,
          ])
        ),
      ],
    };
  }
  return result;
}

function withinProcessVariation(values) {
  const normalized = [];
  const byReplicate = new Map();
  for (const value of values) {
    const current = byReplicate.get(value.replicate) ?? {
      ours: [],
      reference: [],
    };
    current.ours.push(value.ours);
    current.reference.push(value.reference);
    byReplicate.set(value.replicate, current);
  }
  for (const value of byReplicate.values()) {
    const oursCenter = median(value.ours);
    const referenceCenter = median(value.reference);
    normalized.push(
      ...value.ours.map((sample) => sample / oursCenter),
      ...value.reference.map((sample) => sample / referenceCenter)
    );
  }
  return variationMetrics(normalized).relativeSpan;
}
