import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';
import { computeVehicleValue } from '@services/vehicles/compute-vehicle-value';
import { parseISO } from 'date-fns';

import { type OverrideRow, type VehicleRow, replayVehicleOverrides } from './vehicle-overrides-20261126';

const vehicle = (patch: Partial<VehicleRow> = {}): VehicleRow => ({
  accountId: 'acc',
  userId: 1,
  vehicleClass: VEHICLE_CLASS.sedan,
  depreciationPreset: DEPRECIATION_PRESET.classDefault,
  customAnnualRatePct: null,
  salvageFloorPct: '10.00',
  purchasePrice: '20000',
  purchaseDate: '2022-03-10',
  valueAnchor: null,
  valueAnchorDate: null,
  decimals: 2,
  ...patch,
});

// Local noon, so the date it formats to is the same in every timezone.
const override = (
  date: string,
  amount: string,
  transactionType = 'income',
  note: string | null = null,
): OverrideRow => ({
  time: new Date(`${date}T12:00:00`),
  amount,
  transactionType,
  note,
});

describe('replayVehicleOverrides', () => {
  // The migration keeps its own copy of the curves. It has to agree with the live function today,
  // or the values written to the log would differ from what the app showed.
  it.each([
    [VEHICLE_CLASS.sedan, DEPRECIATION_PRESET.classDefault, null, '2024-06-20'],
    [VEHICLE_CLASS.luxury, DEPRECIATION_PRESET.fast, null, '2031-01-05'],
    [VEHICLE_CLASS.ev, DEPRECIATION_PRESET.slow, null, '2023-02-01'],
    [VEHICLE_CLASS.truck, DEPRECIATION_PRESET.average, null, '2040-12-31'],
    [VEHICLE_CLASS.other, DEPRECIATION_PRESET.custom, '12.50', '2026-08-15'],
  ])('matches computeVehicleValue for %s / %s / %s on %s', (vehicleClass, preset, customRate, date) => {
    const row = vehicle({ vehicleClass, depreciationPreset: preset, customAnnualRatePct: customRate });

    const [entry] = replayVehicleOverrides({ vehicle: row, overrides: [override(date, '0')] });

    const live = computeVehicleValue({
      anchorValue: Money.fromDecimal(20000),
      anchorDate: parseISO('2022-03-10'),
      asOf: parseISO(date),
      vehicleClass,
      preset,
      customAnnualRatePct: customRate ? Number(customRate) : null,
      salvageFloorPct: 10,
    }).round(2);
    expect(Number(entry!.value)).toBeCloseTo(live.toNumber(), 2);
  });

  it('adds an income override to the depreciated value and subtracts an expense one', () => {
    const [up] = replayVehicleOverrides({ vehicle: vehicle(), overrides: [override('2024-03-10', '1500')] });
    const [down] = replayVehicleOverrides({
      vehicle: vehicle(),
      overrides: [override('2024-03-10', '1500', 'expense')],
    });
    const [flat] = replayVehicleOverrides({ vehicle: vehicle(), overrides: [override('2024-03-10', '0')] });

    expect(Number(up!.value) - Number(flat!.value)).toBeCloseTo(1500, 2);
    expect(Number(flat!.value) - Number(down!.value)).toBeCloseTo(1500, 2);
  });

  it('replays overrides in order, each starting from the one before, and keeps the note', () => {
    const entries = replayVehicleOverrides({
      vehicle: vehicle(),
      overrides: [override('2023-03-10', '1000', 'income', 'appraisal'), override('2024-03-10', '0')],
    });

    expect(entries.map((entry) => entry.date)).toEqual(['2023-03-10', '2024-03-10']);
    expect(entries[0]!.note).toBe('appraisal');
    // The second starts from the first (a year of depreciation on top of it), not from the purchase.
    const fromFirst = computeVehicleValue({
      anchorValue: Money.fromDecimal(entries[0]!.value),
      anchorDate: parseISO('2023-03-10'),
      asOf: parseISO('2024-03-10'),
      vehicleClass: VEHICLE_CLASS.sedan,
      preset: DEPRECIATION_PRESET.classDefault,
      customAnnualRatePct: null,
      salvageFloorPct: 10,
    }).round(2);
    expect(Number(entries[1]!.value)).toBeCloseTo(fromFirst.toNumber(), 2);
  });

  it('keeps one entry per date, the later override', () => {
    const entries = replayVehicleOverrides({
      vehicle: vehicle(),
      overrides: [override('2024-03-10', '100'), override('2024-03-10', '900')],
    });

    expect(entries).toHaveLength(1);
  });

  it('takes the stored anchor for the latest entry when it is dated the same day', () => {
    const entries = replayVehicleOverrides({
      vehicle: vehicle({ valueAnchor: '16543.21', valueAnchorDate: '2024-03-10' }),
      overrides: [override('2023-03-10', '100'), override('2024-03-10', '900')],
    });

    expect(entries[1]!.value).toBe('16543.21');
    expect(entries[0]!.value).not.toBe('16543.21');
  });

  it('does not take the stored anchor when it is dated another day', () => {
    const entries = replayVehicleOverrides({
      vehicle: vehicle({ valueAnchor: '1.00', valueAnchorDate: '2020-01-01' }),
      overrides: [override('2024-03-10', '900')],
    });

    expect(entries[0]!.value).not.toBe('1.00');
  });
});
