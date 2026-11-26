import { ACCOUNT_CATEGORIES, type AccountSectionId, getAccountSection } from './accounts';
import type { RecordId } from './record-id';

export enum ACCOUNT_LINK_RELATIONS {
  /** The `from` account (a loan) is secured by the `to` account (an asset such as a car or home). */
  securedBy = 'secured_by',
}

interface AccountLinkRelationDefinition {
  /** i18n key of the relation as read from the `from` account ("Secured by"). */
  labelKey: string;
  /** Section the `from` account must be listed under. */
  fromSection: AccountSectionId;
  /** Section the `to` account must be listed under. */
  toSection: AccountSectionId;
}

/**
 * The one place that says which accounts a relation may join. A link is many-to-many (a home can
 * secure several loans, a loan can be secured by several assets) and carries no balance of its own.
 */
export const ACCOUNT_LINK_RELATION_REGISTRY = {
  [ACCOUNT_LINK_RELATIONS.securedBy]: {
    labelKey: 'common.accountLinks.securedBy',
    fromSection: 'loans',
    toSection: 'assets',
  },
} as const satisfies Record<ACCOUNT_LINK_RELATIONS, AccountLinkRelationDefinition>;

export const isAccountLinkAllowed = ({
  relation,
  fromCategory,
  toCategory,
}: {
  relation: ACCOUNT_LINK_RELATIONS;
  fromCategory: ACCOUNT_CATEGORIES;
  toCategory: ACCOUNT_CATEGORIES;
}): boolean => {
  const definition = ACCOUNT_LINK_RELATION_REGISTRY[relation];
  if (!definition) return false;
  return (
    getAccountSection(fromCategory) === definition.fromSection && getAccountSection(toCategory) === definition.toSection
  );
};

export interface AccountLinkApiResponse {
  id: RecordId;
  fromAccountId: RecordId;
  toAccountId: RecordId;
  relation: ACCOUNT_LINK_RELATIONS;
}

export interface CreateAccountLinkBody {
  fromAccountId: RecordId;
  toAccountId: RecordId;
  relation: ACCOUNT_LINK_RELATIONS;
}
