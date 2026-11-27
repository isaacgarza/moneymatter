import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';

import { VEHICLE_RESPONSE_INCLUDE } from './helpers';
import { refreshStaleVehicleValuesForUser } from './refresh-vehicle-value.service';

interface GetVehiclesParams {
  userId: number;
}

const getVehiclesImpl = async ({ userId }: GetVehiclesParams) => {
  // Refresh any vehicles whose 7-day cache has expired so the returned values
  // are fresh in the response. Errors per-vehicle are swallowed inside.
  await refreshStaleVehicleValuesForUser({ userId });

  const accountIds = await getAccessibleAccountIdsForUser({ userId });

  return Vehicles.findAll({
    where: { accountId: accountIds },
    include: VEHICLE_RESPONSE_INCLUDE,
    order: [['createdAt', 'DESC']],
  });
};

export const getVehicles = withTransaction(getVehiclesImpl);
