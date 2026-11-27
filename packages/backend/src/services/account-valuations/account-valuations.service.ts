import { type AccountValuationApiResponse, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { moneyToApiDecimal, type Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountValuations from '@models/account-valuations.model';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';
import { refreshVehicleValueIfStale } from '@services/vehicles/refresh-vehicle-value.service';

export const serializeAccountValuation = (valuation: AccountValuations): AccountValuationApiResponse => ({
  id: valuation.id,
  accountId: valuation.accountId,
  date: valuation.date,
  value: moneyToApiDecimal(valuation.value),
  note: valuation.note,
});

/**
 * A valuation changed what an asset is worth, so any value derived from the log is stale. Vehicles
 * hold a cached depreciated balance: drop it and recompute now, so the response and the next read
 * agree. Other categories own no derived value yet.
 */
const refreshDerivedValue = async ({ accountId }: { accountId: string }): Promise<Money | null> => {
  const vehicle = await Vehicles.findOne({ where: { accountId }, attributes: ['id'] });
  if (!vehicle) return null;
  await vehicle.update({ valueLastComputedAt: null });
  const refreshed = await refreshVehicleValueIfStale({ vehicleId: vehicle.id, force: true });
  return refreshed.value;
};

export const getAccountValuations = async ({
  userId,
  accountId,
}: {
  userId: number;
  accountId: string;
}): Promise<AccountValuationApiResponse[]> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    requiredPermission: SHARE_PERMISSIONS.read,
  });
  if (!access.granted) {
    throw new NotFoundError({ message: t({ key: 'accountValuations.accountNotFound' }) });
  }

  const valuations = await AccountValuations.findAll({ where: { accountId }, order: [['date', 'DESC']] });
  return valuations.map(serializeAccountValuation);
};

/** Sets what the account is worth on `date`; a second entry for the same date replaces the first. */
export const setAccountValuation = withTransaction(
  async ({
    account,
    date,
    value,
    note,
  }: {
    account: Pick<Accounts, 'id' | 'userId'>;
    date: string;
    value: Money;
    note?: string | null;
  }): Promise<{ valuation: AccountValuations; derivedValue: Money | null }> => {
    const existing = await AccountValuations.findOne({ where: { accountId: account.id, date } });
    const valuation = existing
      ? await existing.update({ value, note: note ?? null })
      : await AccountValuations.create({ userId: account.userId, accountId: account.id, date, value, note });

    return { valuation, derivedValue: await refreshDerivedValue({ accountId: account.id }) };
  },
);

export const deleteAccountValuation = withTransaction(
  async ({ userId, id }: { userId: number; id: string }): Promise<void> => {
    const valuation = await findOrThrowNotFound({
      query: AccountValuations.findOne({ where: { id, userId } }),
      message: t({ key: 'accountValuations.notFound' }),
    });
    const { accountId } = valuation;
    await valuation.destroy();
    await refreshDerivedValue({ accountId });
  },
);
