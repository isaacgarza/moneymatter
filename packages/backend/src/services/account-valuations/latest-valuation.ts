interface DatedValuation {
  /** yyyy-MM-dd */
  date: string;
}

/**
 * The entry that holds on `asOf`: the latest one dated on or before it, or `null` when none is.
 * The one place that decides which valuation an asset's depreciation starts from; `asOf` omitted
 * means the latest entry overall. Does not assume the input is sorted. On equal dates the entry
 * listed later wins, so a valuation dated the purchase day replaces the purchase anchor.
 */
export const latestValuationOnOrBefore = <T extends DatedValuation>({
  valuations,
  asOf,
}: {
  valuations: readonly T[];
  asOf?: string;
}): T | null => {
  let latest: T | null = null;
  for (const valuation of valuations) {
    if (asOf !== undefined && valuation.date > asOf) continue;
    if (latest === null || valuation.date >= latest.date) latest = valuation;
  }
  return latest;
};
