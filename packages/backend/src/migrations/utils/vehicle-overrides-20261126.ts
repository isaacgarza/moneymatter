import Big from 'big.js';
import { addYears, differenceInCalendarDays, format, parseISO } from 'date-fns';

/**
 * Frozen replay of a vehicle's manual overrides into absolute values, for migration
 * `20261126000000-create-account-valuations`. Do not edit, and do not import live code here.
 */

// A frozen copy of the depreciation curves and math as they were when this migration was written.
// A migration never imports live code: the app's curves may change later, and re-running this
// against an old database must keep producing the values it produced then.
const CLASS_DEFAULT_CURVES: Record<string, number[]> = {
  sedan: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
  suv: [18, 14, 11, 10, 8, 7, 6, 5, 5, 4],
  truck: [15, 12, 10, 9, 8, 7, 6, 5, 5, 4],
  luxury: [25, 18, 14, 12, 10, 8, 7, 6, 5, 5],
  ev: [22, 17, 13, 10, 8, 7, 6, 5, 5, 4],
  motorcycle: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
  other: [20, 15, 12, 10, 8, 7, 6, 5, 5, 4],
};
const TAIL_RATE_PCT = 4;
const PRESET_MULTIPLIERS: Record<string, number> = { slow: 0.7, average: 1, fast: 1.3 };

const annualRate = ({ vehicle, yearIndex }: { vehicle: VehicleRow; yearIndex: number }): number => {
  if (vehicle.depreciationPreset === 'custom') {
    return (vehicle.customAnnualRatePct ? Number(vehicle.customAnnualRatePct) : 0) / 100;
  }
  const curve = CLASS_DEFAULT_CURVES[vehicle.vehicleClass] ?? CLASS_DEFAULT_CURVES.other!;
  const basePct = yearIndex < curve.length ? curve[yearIndex]! : TAIL_RATE_PCT;
  const multiplier = PRESET_MULTIPLIERS[vehicle.depreciationPreset] ?? PRESET_MULTIPLIERS.average!;
  return (basePct * multiplier) / 100;
};

const depreciatedValue = ({
  vehicle,
  anchorValue,
  anchorDate,
  asOf,
}: {
  vehicle: VehicleRow;
  anchorValue: Big;
  anchorDate: Date;
  asOf: Date;
}): Big => {
  if (differenceInCalendarDays(asOf, anchorDate) <= 0) return anchorValue;

  const floor = anchorValue.times(Number(vehicle.salvageFloorPct) / 100);
  let value = anchorValue;
  let cursor = anchorDate;
  let yearIndex = 0;

  while (true) {
    const nextAnniversary = addYears(cursor, 1);
    if (asOf >= nextAnniversary) {
      value = value.times(1 - annualRate({ vehicle, yearIndex }));
      if (value.lt(floor)) return floor;
      cursor = nextAnniversary;
      yearIndex += 1;
      continue;
    }

    const daysInYear = differenceInCalendarDays(nextAnniversary, cursor);
    const partialDays = differenceInCalendarDays(asOf, cursor);
    if (partialDays > 0 && daysInYear > 0) {
      value = value.times(1 - annualRate({ vehicle, yearIndex }) * (partialDays / daysInYear));
      if (value.lt(floor)) return floor;
    }
    return value;
  }
};

export interface VehicleRow {
  accountId: string;
  userId: number;
  vehicleClass: string;
  depreciationPreset: string;
  customAnnualRatePct: string | null;
  salvageFloorPct: string;
  purchasePrice: string;
  purchaseDate: string;
  valueAnchor: string | null;
  valueAnchorDate: string | null;
  decimals: number;
}

export interface OverrideRow {
  time: Date;
  amount: string;
  transactionType: string;
  note: string | null;
}

export function replayVehicleOverrides({ vehicle, overrides }: { vehicle: VehicleRow; overrides: OverrideRow[] }) {
  let anchorValue = new Big(vehicle.purchasePrice);
  let anchorDate = vehicle.purchaseDate;
  const entries: { date: string; value: string; note: string | null }[] = [];

  for (const tx of overrides) {
    const date = format(tx.time, 'yyyy-MM-dd');
    const before = depreciatedValue({
      vehicle,
      anchorValue,
      anchorDate: parseISO(anchorDate),
      asOf: parseISO(date),
    }).round(vehicle.decimals, Big.roundHalfUp);
    anchorValue = tx.transactionType === 'income' ? before.plus(tx.amount) : before.minus(tx.amount);
    anchorDate = date;

    const entry = { date, value: anchorValue.toFixed(18), note: tx.note };
    // Two overrides on one day collapse to the later one, like the unique (account, date) rule.
    const last = entries[entries.length - 1];
    if (last && last.date === date) entries[entries.length - 1] = entry;
    else entries.push(entry);
  }

  // The stored anchor is what the user sees live; it wins for the latest entry.
  const latest = entries[entries.length - 1]!;
  if (vehicle.valueAnchor !== null && vehicle.valueAnchorDate === latest.date) {
    latest.value = vehicle.valueAnchor;
  }

  return entries;
}
