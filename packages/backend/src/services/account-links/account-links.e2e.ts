import { ACCOUNT_LINK_RELATIONS, VEHICLE_CLASS } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subYears } from 'date-fns';

const createLoan = () =>
  helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({ name: 'Car loan' }),
    raw: true,
  });

const createCar = () =>
  helpers.createVehicle({
    name: 'Family car',
    currencyCode: 'USD',
    make: 'Toyota',
    model: 'Camry',
    year: 2020,
    vehicleClass: VEHICLE_CLASS.sedan,
    purchasePrice: 25000,
    purchaseDate: format(subYears(new Date(), 2), 'yyyy-MM-dd'),
    raw: true,
  });

// The loan response is the loan's account; the vehicle response carries its account id separately.
const linkLoanToCar = async () => {
  const [loan, car] = await Promise.all([createLoan(), createCar()]);
  return { loan, car, carAccountId: car.accountId };
};

describe('Account links', () => {
  describe('POST /account-links', () => {
    it('links a loan to the asset that secures it and lists the link', async () => {
      const { loan, carAccountId } = await linkLoanToCar();

      const created = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(created.statusCode).toBe(201);
      expect(created.body.response).toMatchObject({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      const links = await helpers.getAccountLinks({ raw: true });
      expect(links).toEqual([expect.objectContaining({ id: created.body.response.id })]);
    });

    it('rejects the link when the direction does not match the relation', async () => {
      const { loan, carAccountId } = await linkLoanToCar();

      const reversed = await helpers.createAccountLink({
        fromAccountId: carAccountId,
        toAccountId: loan.id,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(reversed.statusCode).toBe(422);
      expect(await helpers.getAccountLinks({ raw: true })).toEqual([]);
    });

    it('rejects a loan secured by a plain bank account', async () => {
      const [loan, bank] = await Promise.all([createLoan(), helpers.createAccount({ raw: true })]);

      const result = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: bank.id,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(result.statusCode).toBe(422);
    });

    it('rejects linking an account to itself', async () => {
      const loan = await createLoan();

      const result = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: loan.id,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(result.statusCode).toBe(422);
    });

    it('rejects an account that does not exist', async () => {
      const loan = await createLoan();

      const result = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: generateRandomRecordId(),
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(result.statusCode).toBe(422);
    });

    it('rejects the same link twice', async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      const payload = {
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      };

      await helpers.createAccountLink({ ...payload, raw: true });
      const duplicate = await helpers.createAccountLink(payload);

      expect(duplicate.statusCode).toBe(409);
      expect(await helpers.getAccountLinks({ raw: true })).toHaveLength(1);
    });

    it('lets one asset secure several loans and one loan be secured by several assets', async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      const [secondLoan, secondCar] = await Promise.all([createLoan(), createCar()]);

      for (const [from, to] of [
        [loan.id, carAccountId],
        [secondLoan.id, carAccountId],
        [loan.id, secondCar.accountId],
      ]) {
        const result = await helpers.createAccountLink({
          fromAccountId: from!,
          toAccountId: to!,
          relation: ACCOUNT_LINK_RELATIONS.securedBy,
        });
        expect(result.statusCode).toBe(201);
      }

      expect(await helpers.getAccountLinks({ raw: true })).toHaveLength(3);
    });

    it("does not link another user's account", async () => {
      const loan = await createLoan();
      const other = await helpers.signUpSecondUser();
      const otherCar = await helpers.asUser({
        cookies: other.cookies,
        fn: async () => {
          await helpers.makeRequest({
            method: 'post',
            url: '/user/currencies/base',
            payload: { currencyCode: global.BASE_CURRENCY.code },
          });
          return createCar();
        },
      });

      const result = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: otherCar.accountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
      });

      expect(result.statusCode).toBe(422);
    });
  });

  describe('GET /account-links', () => {
    it("does not list another user's links", async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
        raw: true,
      });

      const other = await helpers.signUpSecondUser();
      const otherLinks = await helpers.asUser({
        cookies: other.cookies,
        fn: () => helpers.getAccountLinks({ raw: true }),
      });

      expect(otherLinks).toEqual([]);
    });
  });

  describe('DELETE /account-links/:id', () => {
    it('removes the link and leaves both accounts', async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      const link = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
        raw: true,
      });

      const result = await helpers.deleteAccountLink({ id: link.id });

      expect(result.statusCode).toBe(204);
      expect(await helpers.getAccountLinks({ raw: true })).toEqual([]);
      expect((await helpers.getLoanById({ id: loan.id })).statusCode).toBe(200);
    });

    it("does not remove another user's link", async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      const link = await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
        raw: true,
      });

      const other = await helpers.signUpSecondUser();
      const result = await helpers.asUser({
        cookies: other.cookies,
        fn: () => helpers.deleteAccountLink({ id: link.id }),
      });

      expect(result.statusCode).toBe(404);
      expect(await helpers.getAccountLinks({ raw: true })).toHaveLength(1);
    });

    it('is removed with the account it points at', async () => {
      const { loan, carAccountId } = await linkLoanToCar();
      await helpers.createAccountLink({
        fromAccountId: loan.id,
        toAccountId: carAccountId,
        relation: ACCOUNT_LINK_RELATIONS.securedBy,
        raw: true,
      });

      await helpers.deleteLoan({ id: loan.id });

      expect(await helpers.getAccountLinks({ raw: true })).toEqual([]);
    });
  });
});
