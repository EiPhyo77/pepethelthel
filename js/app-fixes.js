(() => {
  'use strict';

  if (window.__moneyflowAppFixesLoaded) return;
  window.__moneyflowAppFixesLoaded = true;

  const STORAGE_KEY = 'moneyflow-v3';
  const readState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      raw.transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
      raw.categories = Array.isArray(raw.categories) ? raw.categories : [];
      raw.budgets = Array.isArray(raw.budgets) ? raw.budgets : [];
      raw.loans = Array.isArray(raw.loans) ? raw.loans : [];
      raw.settings = raw.settings || {};
      return raw;
    } catch (_) {
      return { transactions: [], categories: [], budgets: [], loans: [], settings: {} };
    }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore storage failure
    }
  };

  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const text = (value) => String(value ?? '').trim();
  const showToast = (message, isError = false) => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.borderColor = isError ? 'rgba(239,93,114,.28)' : 'var(--line)';
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  const ensureLoanCategory = () => {
    const state = readState();
    const exists = state.categories.some((cat) => String(cat.name || '').trim().toLowerCase() === 'loan' && String(cat.type || '').trim().toLowerCase() === 'loan');
    if (!exists) {
      state.categories.push({
        id: `cat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: 'Loan',
        type: 'loan'
      });
      saveState(state);
    }
  };

  const ensureLoanTypeOption = () => {
    const typeSelect = document.querySelector('#categoryForm select[name="categoryType"]');
    if (!typeSelect) return;
    if (!Array.from(typeSelect.options).some((option) => option.value === 'loan')) {
      const option = document.createElement('option');
      option.value = 'loan';
      option.textContent = 'Loan';
      typeSelect.appendChild(option);
    }
  };

  const ensureLoanCategoryOption = () => {
    const formCategory = document.querySelector('#transactionForm select[name="category"]');
    if (!formCategory) return;
    const values = Array.from(formCategory.options).map((option) => String(option.value || '').trim());
    if (!values.some((value) => value.toLowerCase() === 'loan')) {
      const option = document.createElement('option');
      option.value = 'Loan';
      option.textContent = 'Loan';
      formCategory.appendChild(option);
    }
  };

  const syncFromGoogleSheet = async () => {
    const state = readState();
    const url = String(state.settings.syncUrl || '').trim();
    if (!url) {
      showToast('Add the Apps Script URL in Settings.', true);
      return;
    }

    const status = document.getElementById('syncStatus');
    const button = document.getElementById('syncButton');
    if (button) button.disabled = true;
    if (status) {
      status.textContent = 'Syncing…';
      status.dataset.status = 'loading';
    }

    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=getAll`, { method: 'GET', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result || !result.ok || !result.data) {
        throw new Error(result && result.error ? result.error : `Sync failed (${response.status})`);
      }

      const next = readState();
      next.transactions = Array.isArray(result.data.transactions) ? result.data.transactions : next.transactions;
      next.categories = Array.isArray(result.data.categories) && result.data.categories.length ? result.data.categories : next.categories;
      next.budgets = Array.isArray(result.data.budgets) ? result.data.budgets : next.budgets;
      next.loans = Array.isArray(result.data.loans) ? result.data.loans : next.loans;
      next.settings = next.settings || {};
      next.settings.syncUrl = url;
      saveState(next);

      if (status) {
        status.textContent = 'Synced';
        status.dataset.status = 'success';
      }
      showToast('Data loaded from Google Sheets.');
      setTimeout(() => window.location.reload(), 0);
    } catch (error) {
      if (status) {
        status.textContent = 'Sync failed';
        status.dataset.status = 'error';
      }
      showToast(error.message || 'Unable to load Google Sheets data.', true);
    } finally {
      if (button) button.disabled = false;
    }
  };

  const createBudget = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const form = event.target;
    if (!form || form.id !== 'budgetForm') return;

    const state = readState();
    const category = text(form.elements.budgetCategory?.value || '');
    const month = text(form.elements.budgetMonth?.value || '');
    const amount = num(form.elements.budgetAmount?.value);

    if (!category || !month || !amount || amount <= 0) {
      showToast('Please complete budget details.', true);
      return;
    }

    state.budgets.push({ id: `bud-${Date.now()}-${Math.random().toString(16).slice(2)}`, month, category, amount });
    saveState(state);
    form.reset();
    showToast('Budget saved.');
    setTimeout(() => window.location.reload(), 250);
  };

  const createCategory = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const form = event.target;
    if (!form || form.id !== 'categoryForm') return;

    const name = text(form.elements.categoryName?.value || '');
    const type = String(form.elements.categoryType?.value || '').trim().toLowerCase();
    if (!name) {
      showToast('Category name is required.', true);
      return;
    }

    const state = readState();
    if (state.categories.some((cat) => String(cat.name || '').trim().toLowerCase() === name.toLowerCase() && String(cat.type || '').trim().toLowerCase() === type)) {
      showToast('This category already exists.', true);
      return;
    }

    state.categories.push({
      id: `cat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      type: type || 'expense'
    });
    saveState(state);
    form.reset();
    showToast('Category added.');
    setTimeout(() => window.location.reload(), 250);
  };

  const createLoanFromTransaction = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const form = event.target;
    if (!form || form.id !== 'transactionForm') return;

    const selectedMode = form.querySelector('.transaction-tab.active')?.dataset.mode || 'standard';
    const category = String(form.querySelector('select[name="category"]')?.value || '').trim();
    const amount = num(form.querySelector('input[name="amount"]')?.value);
    const note = text(form.querySelector('input[name="note"]')?.value);
    const date = form.querySelector('input[name="date"]')?.value || new Date().toISOString().slice(0, 10);

    if (selectedMode === 'repayment') {
      const state = readState();
      const loanId = String(form.querySelector('select[name="loanId"]')?.value || '').trim();
      const repaymentAmount = num(form.querySelector('input[name="repaymentAmount"]')?.value);
      if (!loanId || repaymentAmount <= 0) {
        showToast('Select a valid loan and repayment amount.', true);
        return;
      }

      const loan = state.loans.find((item) => String(item.id) === String(loanId));
      if (!loan) {
        showToast('Loan not found.', true);
        return;
      }

      state.transactions.push({
        id: `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'expense',
        category: 'Loan repayment',
        amount: repaymentAmount,
        date,
        note: note || `Repayment - ${loan.name || 'Loan'}`,
        loanId,
        createdAt: new Date().toISOString()
      });

      loan.paid = num(loan.paid) + repaymentAmount;
      loan.balance = Math.max(0, num(loan.balance) - repaymentAmount);
      loan.remaining = Math.max(0, num(loan.remaining) - repaymentAmount);
      saveState(state);
      showToast('Loan repayment saved.');
      setTimeout(() => window.location.reload(), 250);
      return;
    }

    if (category.toLowerCase() === 'loan') {
      if (amount <= 0) {
        showToast('Enter a valid loan amount.', true);
        return;
      }

      const state = readState();
      const loanName = note || 'Loan';
      const loanId = `loan-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      state.transactions.push({
        id: `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'income',
        category: 'Loan',
        amount,
        date,
        note: loanName,
        loanId,
        createdAt: new Date().toISOString()
      });

      state.loans.push({
        id: loanId,
        name: loanName,
        principal: amount,
        remaining: amount,
        balance: amount,
        paid: 0,
        date,
        note: loanName,
        createdAt: new Date().toISOString()
      });

      saveState(state);
      showToast('Loan saved.');
      setTimeout(() => window.location.reload(), 250);
    }
  };

  const ensureRuntimeOptions = () => {
    ensureLoanTypeOption();
    ensureLoanCategory();
    ensureLoanCategoryOption();
    const loanSelect = document.querySelector('#transactionForm select[name="loanId"]');
    if (loanSelect) {
      const state = readState();
      const loans = Array.isArray(state.loans) ? state.loans.filter((loan) => num(loan.balance) > 0) : [];
      loanSelect.innerHTML = loans.length
        ? loans.map((loan) => `<option value="${loan.id}">${loan.name || 'Loan'} · ${num(loan.balance).toLocaleString()} MMK</option>`).join('')
        : '<option value="">No active loans</option>';
    }
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('#syncButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncFromGoogleSheet();
    }
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form) return;

    if (form.id === 'budgetForm') {
      createBudget(event);
      return;
    }

    if (form.id === 'categoryForm') {
      createCategory(event);
      return;
    }

    if (form.id === 'transactionForm') {
      createLoanFromTransaction(event);
      return;
    }
  }, true);

  const boot = () => {
    ensureRuntimeOptions();
    const categoryType = document.querySelector('#categoryForm select[name="categoryType"]');
    if (categoryType && !Array.from(categoryType.options).some((option) => option.value === 'expense')) {
      const expense = document.createElement('option');
      expense.value = 'expense';
      expense.textContent = 'Expense';
      categoryType.insertBefore(expense, categoryType.firstChild);
    }
    if (categoryType && !Array.from(categoryType.options).some((option) => option.value === 'income')) {
      const income = document.createElement('option');
      income.value = 'income';
      income.textContent = 'Income';
      categoryType.insertBefore(income, categoryType.firstChild);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
