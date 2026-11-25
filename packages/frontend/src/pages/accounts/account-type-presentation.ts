import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_CATEGORY_REGISTRY,
  type AccountColorId,
  type AccountIconId,
} from '@bt/shared/types';
import {
  BanknoteIcon,
  BitcoinIcon,
  CarIcon,
  CreditCardIcon,
  GiftIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PiggyBankIcon,
  ShieldIcon,
  TrendingUpIcon,
  WalletIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

/**
 * Icon and chip color per account category, so account list rows don't drift apart. The category →
 * icon id and color id mapping lives in the account category registry (`@bt/shared/types`); this file
 * only maps those ids to components and classes.
 * Color comes from the `--account-<color>` design tokens (see `global.css`) bridged to Tailwind as
 * `bg-account-<color>` / `text-account-<color>`, applied as a soft tinted square behind the row icon.
 */

const ACCOUNT_ICONS: Record<AccountIconId, Component> = {
  landmark: LandmarkIcon,
  wallet: WalletIcon,
  gift: GiftIcon,
  shield: ShieldIcon,
  'piggy-bank': PiggyBankIcon,
  'credit-card': CreditCardIcon,
  banknote: BanknoteIcon,
  'trending-up': TrendingUpIcon,
  bitcoin: BitcoinIcon,
  car: CarIcon,
  'hand-coins': HandCoinsIcon,
};

/**
 * Soft tinted square behind the account-category icon in list rows. Each entry is a full static
 * literal so Tailwind's scanner picks the classes up — never build these by string interpolation.
 */
const TINTED_CHIP_CLASSES: Record<AccountColorId, string> = {
  checking: 'bg-account-checking/15 text-account-checking',
  saving: 'bg-account-saving/15 text-account-saving',
  credit: 'bg-account-credit/15 text-account-credit',
  cash: 'bg-account-cash/15 text-account-cash',
  investment: 'bg-account-investment/15 text-account-investment',
  crypto: 'bg-account-crypto/15 text-account-crypto',
  vehicle: 'bg-account-vehicle/15 text-account-vehicle',
};

/** Opaque counterpart, for a chip that overlaps other content where the tint would let it show through. */
const SOLID_CHIP_CLASSES: Record<AccountColorId, string> = {
  checking: 'bg-account-checking text-background',
  saving: 'bg-account-saving text-background',
  credit: 'bg-account-credit text-background',
  cash: 'bg-account-cash text-background',
  investment: 'bg-account-investment text-background',
  crypto: 'bg-account-crypto text-background',
  vehicle: 'bg-account-vehicle text-background',
};

// Fall back to `general` so an unrecognized category (e.g. new server-side value) still renders.
const getDefinition = ({ category }: { category: ACCOUNT_CATEGORIES }) =>
  ACCOUNT_CATEGORY_REGISTRY[category] ?? ACCOUNT_CATEGORY_REGISTRY[ACCOUNT_CATEGORIES.general];

export const getAccountTypeIcon = ({ category }: { category: ACCOUNT_CATEGORIES }): Component =>
  ACCOUNT_ICONS[getDefinition({ category }).icon];

export const getAccountTypeTintedChipClass = ({ category }: { category: ACCOUNT_CATEGORIES }): string =>
  TINTED_CHIP_CLASSES[getDefinition({ category }).color];

export const getAccountTypeSolidChipClass = ({ category }: { category: ACCOUNT_CATEGORIES }): string =>
  SOLID_CHIP_CLASSES[getDefinition({ category }).color];
