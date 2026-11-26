import { ACCOUNT_LINK_RELATIONS, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Accounts from './accounts.model';
import Users from './users.model';

/**
 * A relation between two accounts of one user (a loan secured by a car or home). The link carries
 * no balance: anything derived from it, such as equity, is computed on read.
 */
@Table({
  tableName: 'AccountLinks',
  timestamps: true,
  freezeTableName: true,
})
export default class AccountLinks extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => Accounts)
  @Column({ type: DataType.UUID, allowNull: false })
  fromAccountId!: RecordId;

  @ForeignKey(() => Accounts)
  @Column({ type: DataType.UUID, allowNull: false })
  toAccountId!: RecordId;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    validate: { isIn: [Object.values(ACCOUNT_LINK_RELATIONS)] },
  })
  relation!: ACCOUNT_LINK_RELATIONS;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Accounts, { foreignKey: 'fromAccountId', onDelete: 'CASCADE' })
  fromAccount?: Accounts;

  @BelongsTo(() => Accounts, { foreignKey: 'toAccountId', onDelete: 'CASCADE' })
  toAccount?: Accounts;
}
