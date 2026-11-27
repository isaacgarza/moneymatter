import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Accounts from './accounts.model';
import Users from './users.model';

/**
 * What the user says an account is worth on a date, in the account's currency. An absolute value,
 * never a difference: depreciation and the balance read the latest entry on or before a date, and
 * computed values are never stored here. One entry per account and date.
 */
@Table({
  tableName: 'AccountValuations',
  timestamps: true,
  freezeTableName: true,
})
export default class AccountValuations extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => Accounts)
  @Column({ type: DataType.UUID, allowNull: false })
  accountId!: RecordId;

  /** yyyy-MM-dd */
  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @MoneyField()
  declare value: Money;

  @Column({ type: DataType.TEXT, allowNull: true })
  note!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts, { foreignKey: 'accountId', onDelete: 'CASCADE' })
  account?: Accounts;
}
