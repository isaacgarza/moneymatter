import type { RecordId } from './record-id';

export interface AccountValuationApiResponse {
  id: RecordId;
  accountId: RecordId;
  /** yyyy-MM-dd */
  date: string;
  /** What the account is worth on `date`, in the account's currency. */
  value: number;
  note: string | null;
}
