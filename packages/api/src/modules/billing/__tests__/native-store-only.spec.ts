import { BillingController } from '../billing.controller';

describe('Native store billing surface', () => {
  it('exposes Apple account binding, verification, reconciliation and status handlers', () => {
    const methods = Object.getOwnPropertyNames(BillingController.prototype);

    expect(methods.sort()).toEqual(['constructor', 'getStatus', 'accountToken', 'verifyApple', 'reconcileApple'].sort());
  });
});
