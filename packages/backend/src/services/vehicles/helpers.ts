import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountValuations from '@models/account-valuations.model';
import Accounts from '@models/accounts.model';
import Vehicles from '@models/vehicles.model';
import { type FindOptions } from 'sequelize';

/**
 * What a vehicle response needs: the account and its valuation log, whose latest entry is the
 * depreciation anchor the serializer reports.
 */
export const VEHICLE_RESPONSE_INCLUDE = [{ model: Accounts }, { model: AccountValuations, as: 'valuations' }];

/**
 * Load a user's vehicle by id, throwing NotFoundError when it does not exist or
 * belongs to another user. The `where` clause is fixed to scope by owner; extra
 * find options (e.g. `attributes` to narrow the columns loaded) pass through.
 */
export const findVehicleOrThrow = async ({
  vehicleId,
  userId,
  ...options
}: { vehicleId: string; userId: number } & Omit<FindOptions<Vehicles>, 'where'>) => {
  return findOrThrowNotFound({
    query: Vehicles.findOne({ where: { id: vehicleId, userId }, ...options }),
    message: t({ key: 'vehicles.notFound' }),
  });
};
