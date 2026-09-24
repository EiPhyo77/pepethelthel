(() => {
  'use strict';

  if (window.__moneyflowLoanSyncFixLoaded) return;
  window.__moneyflowLoanSyncFixLoaded = true;

  const KEY = 'moneyflow-v3';
  const text = (value) => String(value ?? '').trim();
  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '{}');
      value.settings = value.settings || {};
      value.transactions = Array.isArray(value.transactions) ? value.transactions : [];
      value.categories = Array.isArray(value.categories) ? value.categories : [];
      value.budgets = Array.isArray(value.budgets) ? value.budgets : [];
      value.loans = Array.isArray(value.loans) ? value.loans : [];
      return value;
    } catch (_) {
      return { settings: {}, transactions: [], categories: [], budgets: [], loans: [] };
    }
  };

  const write = (value) => {
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) {}
  };

  const toast = (message, error = false) => {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.style.borderColor = error ? 'rgba(239,93,114,.28)' : 'var(--line)';
    node.classList.add('show');
    clearTimeout(node._loanSyncTimer);
    node._loanSyncTimer = setTimeout(() => node.classList.remove('show'), 2600);
  };

  const activeLoanBalance = (loan) => Math.max(0, num(loan && (loan.balance ?? loan.remaining ?? loan.principal)));

  const refreshLoanSelect = (form) => {
    const select = form?.querySelector('select[name="loanId"]');
    if (!select) return;
    const loans = read().loans.filter((loan) => activeLoanBalance(loan) > 0);
    select.innerHTML = loans.length
      ? loans.map((loan) => `<option value="${loan.id}">${loan.name || 'Loan'} · ${activeLoanBalance(loan).toLocaleString()} MMK</option>`).join('')
      : '<option value="">No active loans</option>';
  };

  const addNewLoanTab = (modal) => {
    if (!modal || modal.querySelector('.transaction-tab[data-mode="loan"]')) return;
    const tabs = modal.querySelector('.transaction-tabs');
    if (!tabs) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'transaction-tab';
    button.dataset.mode = 'loan';
    button.textContent = 'New loan';
    tabs.appendChild(button);
    button.addEventListener('click', () => {
      modal.querySelectorAll('.transaction-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
      modal.querySelector('#repaymentFields')?.classList.add('hidden');
      const type = modal.querySelector('select[name="type"]');
      const category = modal.querySelector('select[name="category"]');
      if (type) type.value = 'income';
      if (category) {
        if (!Array.from(category.options).some((option) => String(option.value).toLowerCase() === 'loan')) {
          const option = document.createElement('option');
          option.value = 'Loan';
          option.textContent = 'Loan';
          category.appendChild(option);
        }
        category.value = 'Loan';
      }
      const repaymentAmount = modal.querySelector('[name="repaymentAmount"]');
      const loanId = modal.querySelector('[name="loanId"]');
      if (repaymentAmount) repaymentAmount.required = false;
      if (loanId) loanId.required = false;
    });
  };

  const sync = async () => {
    const state = read();
    const url = text(state.settings.syncUrl);
    const button = document.getElementById('syncButton');
    const status = document.getElementById('syncStatus');
    if (!url) return toast('Add the Apps Script URL in Settings.', true);

    if (button) button.disabled = true;
    if (status) { status.textContent = 'Syncing…'; status.dataset.status = 'loading'; }
    try {
      const endpoint = `${url}${url.includes('?') ? '&' : '?'}action=getAll`;
      const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || `Sync failed (${response.status})`);

      const data = result.data;
      state.transactions = Array.isArray(data.transactions) ? data.transactions : state.transactions;
      if (Array.isArray(data.categories) && data.categories.length) state.categories = data.categories;
      state.budgets = Array.isArray(data.budgets) ? data.budgets : state.budgets;
      state.loans = Array.isArray(data.loans) ? data.loans : state.loans;
      state.settings.syncUrl = url;
      state.settings.lastSynced = new Date().toISOString();
      write(state);
      if (status) { status.textContent = 'Synced'; status.dataset.status = 'success'; }
      toast('Data loaded from Google Sheets.');
      window.dispatchEvent(new Event('moneyflow:state-updated'));
      window.location.reload();
    } catch (error) {
      if (status) { status.textContent = 'Sync failed'; status.dataset.status = 'error'; }
      toast(error.message || 'Unable to sync data.', true);
    } finally {
      if (button) button.disabled = false;
    }
  };

  const saveNewLoan = (event) => {
    const form = event.target;
    const tab = form?.querySelector('.transaction-tab[data-mode="loan"]');
    if (!form || form.id !== 'transactionForm' || !tab?.classList.contains('active')) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    const amount = num(form.querySelector('[name="amount"]')?.value);
    if (amount <= 0) return toast('Enter a valid loan amount.', true);

    const state = read();
    const loanId = id('loan');
    const date = form.querySelector('[name="date"]')?.value || new Date().toISOString().slice(0, 10);
    const name = text(form.querySelector('[name="note"]')?.value) || 'Loan';
    const createdAt = new Date().toISOString();

    state.transactions.push({ id: id('tx'), type: 'income', category: 'Loan', amount, date, note: name, loanId, createdAt });
    state.loans.push({ id: loanId, name, principal: amount, paid: 0, balance: amount, remaining: amount, date, note: name, createdAt });
    write(state);
    toast('Loan saved.');
    window.dispatchEvent(new Event('moneyflow:state-updated'));
    setTimeout(() => window.location.reload(), 150);
    return true;
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('#syncButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sync();
      return;
    }
    const modal = event.target.closest('#transactionModal');
    if (modal) addNewLoanTab(modal);
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'transactionForm') saveNewLoan(event);
  }, true);

  const observe = () => {
    addNewLoanTab(document.getElementById('transactionModal'));
    refreshLoanSelect(document.getElementById('transactionForm'));
    const observer = new MutationObserver(() => {
      const modal = document.getElementById('transactionModal');
      addNewLoanTab(modal);
      refreshLoanSelect(document.getElementById('transactionForm'));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true });
  else observe();
})();
