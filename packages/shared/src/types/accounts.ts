import type { CurrencyMeta } from './currencies';
import type { EntityLogoFields, EntityLogoPayload } from './entity-logo';
import type { Decimal } from './money';
import type { RecordId } from './record-id';
import type { ResourceShareInfo } from './sharing';
import type { PAYMENT_TYPES } from './transactions';

export enum ACCOUNT_TYPES {
  system = 'system',
  monobank = 'monobank', // monobank provider connection
  enableBanking = 'enable-banking', // enable-banking provider connection
  lunchflow = 'lunchflow', // lunchflow provider connection
  walutomat = 'walutomat', // walutomat provider connection
  simplefin = 'simplefin', // SimpleFIN Bridge provider connection
  akahu = 'akahu', // Akahu (NZ open banking) provider connection
}

/**
 * Supported bank data provider types
 */
export enum BANK_PROVIDER_TYPE {
  MONOBANK = 'monobank',
  ENABLE_BANKING = 'enable-banking',
  LUNCHFLOW = 'lunchflow',
  WALUTOMAT = 'walutomat',
  SIMPLEFIN = 'simplefin',
  AKAHU = 'akahu',
}

/**
 * Why a bank-data-provider connection was deactivated. Stored on
 * `BankDataProviderConnections.metadata.deactivationReason`. Drives the
 * "needs reauth" UI surfacing – only `AUTH_FAILURE` deactivations are
 * shown to the user, manual disconnects stay hidden.
 *
 * `RESTORED` marks a connection that came in through a data-backup restore:
 * its encrypted credentials were undecryptable on this instance and were
 * replaced with an empty stub, so the connection is honestly broken and the
 * user must reconnect before it can sync again.
 */
export const DEACTIVATION_REASON = {
  AUTH_FAILURE: 'auth_failure',
  RESTORED: 'restored',
} as const;

export type DeactivationReason = (typeof DEACTIVATION_REASON)[keyof typeof DEACTIVATION_REASON];

export enum ACCOUNT_STATUSES {
  active = 'active',
  archived = 'archived',
}

export enum ACCOUNT_CATEGORIES {
  general = 'general',
  cash = 'cash',
  currentAccount = 'current-account',
  creditCard = 'credit-card',
  saving = 'saving',
  bonus = 'bonus',
  insurance = 'insurance',
  investment = 'investment',
  loan = 'loan',
  overdraft = 'overdraft',
  crypto = 'crypto',
  vehicle = 'vehicle',
}

export type AccountColorId = 'checking' | 'saving' | 'credit' | 'cash' | 'investment' | 'crypto' | 'vehicle';

/** Icon ids; the frontend maps each to a component. */
export type AccountIconId =
  | 'landmark'
  | 'wallet'
  | 'gift'
  | 'shield'
  | 'piggy-bank'
  | 'credit-card'
  | 'banknote'
  | 'trending-up'
  | 'bitcoin'
  | 'car'
  | 'hand-coins';

/**
 * The sections accounts are listed under in the sidebar and on the Accounts page, in display order.
 * `investing` has no account categories yet: portfolios and ventures are separate entities that
 * render in it, and investment and crypto accounts stay under `banking` until portfolios become
 * account details.
 */
export const ACCOUNT_SECTIONS = ['banking', 'investing', 'assets', 'loans'] as const;
export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number];

interface AccountCategoryDefinition {
  /** i18n key of the category's display name. */
  labelKey: string;
  icon: AccountIconId;
  color: AccountColorId;
  /** The section the category's accounts are listed under. */
  section: AccountSectionId;
  /**
   * Owns a required 1:1 sidecar row (LoanDetails, Vehicles) and a dedicated
   * creation flow (`/loans`, `/vehicles`). Such an account must never be created
   * through the generic `POST /accounts` path — that would produce a sidecar-less
   * account with none of the managed-balance machinery, so the create service
   * rejects it and the create-account UI hides it. Its balance history belongs to
   * the same flow (loan projection, depreciation curve) rather than to
   * `initialBalance + Σtransactions`, so the balance-revalue paths skip it too.
   */
  dedicatedFlow: boolean;
  /** Owned accounts of this category may back a goal; debt and non-cash categories never do. */
  goalEligible: boolean;
  /** A budget plan may attach accounts of this category. */
  budgetAttachable: boolean;
  /** The Net Worth report treats the category as a debt product. */
  netWorthLiability: boolean;
}

const DEFAULTS = {
  section: 'banking',
  dedicatedFlow: false,
  goalEligible: false,
  budgetAttachable: false,
  netWorthLiability: false,
} as const;

type Overrides = Partial<Pick<AccountCategoryDefinition, keyof typeof DEFAULTS>>;

// Generic so each flag keeps its literal type; the derived category lists are typed from it.
const definition = <const T extends Pick<AccountCategoryDefinition, 'labelKey' | 'icon' | 'color'> & Overrides>(
  entry: T,
): Readonly<Omit<typeof DEFAULTS, keyof T> & T> => ({ ...DEFAULTS, ...entry });

/**
 * The one place that describes each account category. Behaviour lists, labels, icons and colours
 * elsewhere are derived from it; add or change a category here, not at its call sites.
 */
export const ACCOUNT_CATEGORY_REGISTRY = {
  [ACCOUNT_CATEGORIES.general]: definition({
    labelKey: 'common.accountCategories.general',
    icon: 'wallet',
    color: 'checking',
    goalEligible: true,
    budgetAttachable: true,
  }),
  [ACCOUNT_CATEGORIES.cash]: definition({
    labelKey: 'common.accountCategories.cash',
    icon: 'banknote',
    color: 'cash',
    goalEligible: true,
    budgetAttachable: true,
  }),
  [ACCOUNT_CATEGORIES.currentAccount]: definition({
    labelKey: 'common.accountCategories.currentAccount',
    icon: 'landmark',
    color: 'checking',
    goalEligible: true,
    budgetAttachable: true,
  }),
  [ACCOUNT_CATEGORIES.creditCard]: definition({
    labelKey: 'common.accountCategories.creditCard',
    icon: 'credit-card',
    color: 'credit',
    budgetAttachable: true,
    netWorthLiability: true,
  }),
  [ACCOUNT_CATEGORIES.saving]: definition({
    labelKey: 'common.accountCategories.saving',
    icon: 'piggy-bank',
    color: 'saving',
    goalEligible: true,
    budgetAttachable: true,
  }),
  [ACCOUNT_CATEGORIES.bonus]: definition({
    labelKey: 'common.accountCategories.bonus',
    icon: 'gift',
    color: 'checking',
  }),
  [ACCOUNT_CATEGORIES.insurance]: definition({
    labelKey: 'common.accountCategories.insurance',
    icon: 'shield',
    color: 'checking',
  }),
  [ACCOUNT_CATEGORIES.investment]: definition({
    labelKey: 'common.accountCategories.investment',
    icon: 'trending-up',
    color: 'investment',
    goalEligible: true,
  }),
  [ACCOUNT_CATEGORIES.loan]: definition({
    labelKey: 'common.accountCategories.loan',
    icon: 'hand-coins',
    color: 'checking',
    section: 'loans',
    dedicatedFlow: true,
    netWorthLiability: true,
  }),
  [ACCOUNT_CATEGORIES.overdraft]: definition({
    labelKey: 'common.accountCategories.overdraft',
    icon: 'credit-card',
    color: 'credit',
    budgetAttachable: true,
    netWorthLiability: true,
  }),
  [ACCOUNT_CATEGORIES.crypto]: definition({
    labelKey: 'common.accountCategories.crypto',
    icon: 'bitcoin',
    color: 'crypto',
    goalEligible: true,
  }),
  [ACCOUNT_CATEGORIES.vehicle]: definition({
    labelKey: 'common.accountCategories.vehicle',
    icon: 'car',
    color: 'vehicle',
    section: 'assets',
    dedicatedFlow: true,
  }),
} as const satisfies Record<ACCOUNT_CATEGORIES, AccountCategoryDefinition>;

type AccountCategoryRegistry = typeof ACCOUNT_CATEGORY_REGISTRY;

type CategoriesWithFlag<Flag extends keyof AccountCategoryDefinition> = {
  [K in keyof AccountCategoryRegistry]: AccountCategoryRegistry[K][Flag] extends true ? K : never;
}[keyof AccountCategoryRegistry];

const categoriesWithFlag = <Flag extends keyof AccountCategoryDefinition>(flag: Flag) =>
  Object.values(ACCOUNT_CATEGORIES).filter(
    (category) => ACCOUNT_CATEGORY_REGISTRY[category][flag] === true,
  ) as CategoriesWithFlag<Flag>[];

export const DEDICATED_FLOW_ACCOUNT_CATEGORIES = categoriesWithFlag('dedicatedFlow');

type DedicatedFlowAccountCategory = CategoriesWithFlag<'dedicatedFlow'>;

export const isDedicatedFlowAccountCategory = (
  category: ACCOUNT_CATEGORIES,
): category is DedicatedFlowAccountCategory =>
  // An unknown category (a newer server value) is not dedicated-flow.
  ACCOUNT_CATEGORY_REGISTRY[category]?.dedicatedFlow ?? false;

/** The section a category's accounts are listed under; an unknown category (a newer server value) lands in `banking`. */
export const getAccountSection = (category: ACCOUNT_CATEGORIES): AccountSectionId =>
  ACCOUNT_CATEGORY_REGISTRY[category]?.section ?? 'banking';

export const GOAL_ELIGIBLE_ACCOUNT_CATEGORIES: readonly ACCOUNT_CATEGORIES[] = categoriesWithFlag('goalEligible');

/** The account categories a budget plan may attach. */
export const BUDGET_PLAN_ATTACHABLE_ACCOUNT_CATEGORIES: readonly ACCOUNT_CATEGORIES[] =
  categoriesWithFlag('budgetAttachable');

export const NET_WORTH_LIABILITY_KINDS = categoriesWithFlag('netWorthLiability');
export type NetWorthLiabilityKind = CategoriesWithFlag<'netWorthLiability'>;

/** Where linking puts the balance residual the post-link sync leaves unexplained. */
export const LINK_RESIDUAL_TARGETS = ['opening-balance', 'adjustment'] as const;
export type LinkResidualTarget = (typeof LINK_RESIDUAL_TARGETS)[number];

/**
 * Known structure for account externalData field.
 * This is a JSONB field that can contain additional custom data.
 */
export interface AccountExternalData {
  /** Bank connection linking metadata (for linked system accounts) */
  bankConnection?: {
    linkedAt: string; // ISO date string
    linkingStrategy: 'forward-only' | 'full-reconciliation';
    balanceReconciliation: {
      systemBalance: Decimal;
      externalBalance: Decimal;
      difference: Decimal;
      adjustmentTransactionId: RecordId | null;
      /** Where the post-link residual goes. Absent means the opening-balance path. */
      residualTarget?: LinkResidualTarget;
      /** Residual the post-link sync left unexplained, folded into the opening balance. */
      absorbedResidual?: Decimal;
      /**
       * Set at link time for queue-synced providers, whose residual cannot be
       * measured until the worker persists the sync. The queue's completion
       * path runs the deferred absorb and clears this.
       */
      pendingAbsorb?: boolean;
    };
  };
  // Allow any additional custom fields
  [key: string]: unknown;
}

export interface AccountModel extends EntityLogoFields {
  type: ACCOUNT_TYPES;
  id: RecordId;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  accountCategory: ACCOUNT_CATEGORIES;
  defaultPaymentType: PAYMENT_TYPES | null;
  currencyCode: string;
  userId: number;
  externalId?: RecordId;
  externalUrl: string | null;
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId?: RecordId;
  /**
   * Provider type denormalized from the connection so the account list / card can render
   * the bank logo without a per-account `GET /connections/:id` round-trip. Safe to expose
   * to share recipients (who can't reach the owner-scoped connection-details endpoint).
   */
  bankProviderType?: BANK_PROVIDER_TYPE | null;
  bankSeamAt: string | null;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: ResourceShareInfo;
  /** Decimals, symbol and kind of the account currency as the account owner defines them. */
  currencyMeta?: CurrencyMeta;
}

/**
 * Serialized account wire shape (DB → API): every monetary field is a decimal,
 * `id`/`type`/`accountCategory` are plain
 * strings, and owner-only bank-link metadata is stripped for share recipients.
 * The single source of truth for both the backend serializer's return type and
 * the frontend loan/account response shapes, so the two can't drift.
 */
export interface AccountApiResponse extends EntityLogoFields {
  id: string;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  type: string;
  accountCategory: string;
  defaultPaymentType: PAYMENT_TYPES | null;
  currencyCode: string;
  userId: number;
  externalId: string | null;
  externalUrl: string | null;
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId: string | null;
  /** Provider type denormalized from the connection so the frontend can render the
   *  bank logo without a per-account connection-details lookup (which is owner-scoped
   *  and unreachable for share recipients). */
  bankProviderType: BANK_PROVIDER_TYPE | null;
  /** Start of the day a manual account was linked to a bank: rows before it stay editable. */
  bankSeamAt: string | null;
  needsRelink?: boolean;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: ResourceShareInfo;
  /** Decimals, symbol and kind of the account currency as the account owner defines them. */
  currencyMeta?: CurrencyMeta;
}

/**
 * Serialized account-group wire shape (DB → API), with nested accounts already
 * serialized and child groups nested the same way. The single source of truth
 * for both the backend serializer's return type and the frontend group type, so
 * the two can't drift.
 */
export interface AccountGroupApiResponse extends EntityLogoFields {
  id: string;
  name: string;
  userId: number;
  parentGroupId: string | null;
  bankDataProviderConnectionId: string | null;
  accounts: AccountApiResponse[];
  childGroups: AccountGroupApiResponse[];
}

/**
 * Account model with computed `needsRelink` flag.
 * Used in API responses where the backend computes whether an Enable Banking
 * account needs to be re-linked due to schema migration (externalId was uid,
 * now should be identification_hash).
 */
export interface AccountWithRelinkStatus extends AccountModel {
  needsRelink: boolean;
}

export interface BalanceModel {
  id: RecordId;
  date: Date;
  amount: number;
  accountId: RecordId;
  account: Omit<AccountModel, 'systemType'>;
}

/** Index signature for bodies whose keys accept an explicit `null` (clear the
 *  stored value) alongside "absent = leave alone". Opt-in per body,
 *  so nulls stay rejected on every other endpoint body. */
type NullableBodyPayload = {
  [key: string | number]: string | number | boolean | null | undefined;
};

export interface CreateAccountBody extends NullableBodyPayload, EntityLogoPayload {
  accountCategory: AccountModel['accountCategory'];
  defaultPaymentType?: AccountModel['defaultPaymentType'];
  currencyCode: AccountModel['currencyCode'];
  name: AccountModel['name'];
  initialBalance: AccountModel['initialBalance'];
  creditLimit: AccountModel['creditLimit'];
  type?: AccountModel['type'];
  externalUrl?: string | null;
}

export interface UpdateAccountBody extends NullableBodyPayload, EntityLogoPayload {
  accountCategory?: AccountModel['accountCategory'];
  defaultPaymentType?: AccountModel['defaultPaymentType'];
  name?: AccountModel['name'];
  currentBalance?: AccountModel['currentBalance'];
  initialBalance?: AccountModel['initialBalance'];
  creditLimit?: AccountModel['creditLimit'];
  status?: ACCOUNT_STATUSES;
  excludeFromStats?: boolean;
  externalUrl?: string | null;
}
