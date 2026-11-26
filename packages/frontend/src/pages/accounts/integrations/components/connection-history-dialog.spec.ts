import { BANK_HISTORY_STATE, type BankHistoryStatus } from '@bt/shared/types';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

import ConnectionHistoryDialog from './connection-history-dialog.vue';

vi.mock('@/api/bank-data-providers', () => ({ updateConnectionDetails: vi.fn() }));
vi.mock('@/components/notification-center', () => ({
  useNotificationCenter: () => ({ addSuccessNotification: vi.fn(), addErrorNotification: vi.fn() }),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false });

const savedHistory: BankHistoryStatus = {
  startDate: '2025-01-01',
  state: BANK_HISTORY_STATE.pending,
  windowsDone: 0,
  windowsTotal: 12,
  nextRunAt: null,
  lastError: null,
};

const mountDialog = async ({ history }: { history: BankHistoryStatus | null }) => {
  const wrapper = mount(ConnectionHistoryDialog, {
    attachTo: document.body,
    props: { open: true, connectionId: 'c1', history },
    global: { plugins: [i18n, VueQueryPlugin] },
  });
  for (let i = 0; i < 5; i++) await nextTick();
  return wrapper;
};

const calendarIsOpen = () => document.querySelector('.vc-container') !== null;

describe('connection history dialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens with the calendar closed when no history is set up', async () => {
    const wrapper = await mountDialog({ history: null });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(calendarIsOpen()).toBe(false);
    wrapper.unmount();
  });

  // iOS Safari shows its own date picker for a focused date input, so opening must not focus it.
  it('does not focus the date field when it opens', async () => {
    const wrapper = await mountDialog({ history: null });

    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.querySelector('input[type="date"]'));
    wrapper.unmount();
  });

  // Proves the closed-state checks above can see a calendar that is open.
  it('shows the calendar once its button is pressed', async () => {
    const wrapper = await mountDialog({ history: null });
    const trigger = document.querySelector('[data-reka-collection-item], button[aria-haspopup="dialog"]');

    trigger!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    (trigger as HTMLElement).click();
    for (let i = 0; i < 5; i++) await nextTick();

    expect(calendarIsOpen()).toBe(true);
    wrapper.unmount();
  });

  it('opens with the calendar closed when a start date is already saved', async () => {
    const wrapper = await mountDialog({ history: savedHistory });

    expect(calendarIsOpen()).toBe(false);
    wrapper.unmount();
  });
});
