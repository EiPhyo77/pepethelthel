(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const LOAN_TYPE = 'loan';
  const LOAN_CATEGORY_NAME = 'Loan';
  const LOAN_REPAYMENT_NAME = 'Loan repayment';

  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const safeText = (value) => String(value ?? '').trim();

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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  };

  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const getActiveLoanBalance = (loan) => {
    const balance = loan && (loan.balance ?? loan.remaining ?? loan.principal ?? 0);
    return Math.max(0, num(balance));
  };

  const ensureLoanTypeOption = () => {
    const select = document.querySelector('#categoryForm select[name="categoryType"]');
    if (!select) return;
    const hasLoanType = Array.from(select.options).some((option) => option.value === LOAN_TYPE);
    if (!hasLoanType) {
      const opt = document.createElement('option');
      opt.value = LOAN_TYPE;
      opt.textContent = 'Loan';
      select.appendChild(opt);
    }
  };

  const ensureLoanCategory = () => {
    const state = readState();
    const exists = state.categories.some((cat) => String(cat.name || '').trim().toLowerCase() === LOAN_CATEGORY_NAME.toLowerCase() && String(cat.type || '').trim().toLowerCase() === LOAN_TYPE);
    if (!exists) {
      state.categories.push({
        id: makeId('cat'),
        name: LOAN_CATEGORY_NAME,
        type: LOAN_TYPE
      });
      saveState(state);
    }
  };

  const populateCategorySelect = () => {
    const state = readState();
    const transactionCategory = document.querySelector('#transactionForm select[name="category"]');
    if (transactionCategory) {
      const options = state.categories.map((cat) => `<option value="${cat.name}">${cat.name} · ${cat.type}</option>`).join('');
      transactionCategory.innerHTML = options || '<option value="">No categories</option>';
    }
  };

  const refreshLoanSelect = () => {
    const form = document.getElementById('transactionForm');
    if (!form) return;
    const select = form.querySelector('select[name="loanId"]');
    if (!select) return;
    const state = readState();
    const loans = state.loans.filter((loan) => getActiveLoanBalance(loan) > 0);

    select.innerHTML = loans.length
      ? loans.map((loan) => `<option value="${loan.id}">${loan.name || 'Loan'} · ${getActiveLoanBalance(loan).toLocaleString()} MMK</option>`).join('')
      : '<option value="">No active loans</option>';
  };

  const createLoanFromIncome = (state, tx) => {
    const categoryName = String(tx.category || '').trim();
    if (categoryName.toLowerCase() !== LOAN_CATEGORY_NAME.toLowerCase()) return;

    const loanName = safeText(tx.note) || 'Loan';
    const existing = state.loans.find((loan) => String(loan.id) === String(tx.loanId));
    if (existing) {
      existing.name = existing.name || loanName;
      existing.principal = num(existing.principal) + num(tx.amount);
      existing.balance = Math.max(0, num(existing.balance) + num(tx.amount));
      existing.remaining = Math.max(0, num(existing.remaining) + num(tx.amount));
      existing.paid = num(existing.paid);
      existing.date = tx.date || existing.date;
      existing.note = loanName;
      return;
    }

    state.loans.push({
      id: tx.loanId || makeId('loan'),
      name: loanName,
      principal: num(tx.amount),
      remaining: num(tx.amount),
      balance: num(tx.amount),
      paid: 0,
      date: tx.date || new Date().toISOString().slice(0, 10),
      note: loanName,
      createdAt: tx.createdAt || new Date().toISOString()
    });
  };

  const applyRepayment = (state, tx) => {
    if (!tx.loanId) return;
    const loan = state.loans.find((item) => String(item.id) === String(tx.loanId));
    if (!loan) return;

    const amount = num(tx.amount);
    const currentBalance = getActiveLoanBalance(loan);
    const nextBalance = Math.max(0, currentBalance - amount);

    loan.balance = nextBalance;
    loan.remaining = nextBalance;
    loan.paid = num(loan.paid) + amount;

    if (loan.principal && num(loan.principal) < num(loan.paid)) {
      loan.principal = num(loan.principal);
    }
  };

  const reconcileLoansFromTransactions = () => {
    const state = readState();
    const txs = Array.isArray(state.transactions) ? state.transactions : [];
    const loanIds = new Set();

    state.loans = (state.loans || []).map((loan) => ({
      ...loan,
      balance: getActiveLoanBalance(loan),
      remaining: getActiveLoanBalance(loan),
      paid: num(loan.paid)
    }));

    txs.forEach((tx) => {
      const category = String(tx.category || '').trim();
      const note = safeText(tx.note);
      const type = String(tx.type || '').trim().toLowerCase();

      if (category.toLowerCase() === LOAN_CATEGORY_NAME.toLowerCase() && type === 'income') {
        tx.loanId = tx.loanId || makeId('loan');
        tx.note = tx.note || 'Loan';
        createLoanFromIncome(state, tx);
        loanIds.add(String(tx.loanId));
      }

      if (category.toLowerCase() === LOAN_REPAYMENT_NAME.toLowerCase() && type === 'expense') {
        tx.loanId = tx.loanId || '';
        if (tx.loanId) {
          applyRepayment(state, tx);
          loanIds.add(String(tx.loanId));
        }
      }
    });

    state.loans = state.loans.filter((loan) => getActiveLoanBalance(loan) > 0 || loanIds.has(String(loan.id)));
    saveState(state);
  };

  const handleCategorySubmit = (event) => {
    const form = event.target;
    if (!form || form.id !== 'categoryForm') return;

    const type = String(form.elements.categoryType?.value || '').trim().toLowerCase();
    if (type !== LOAN_TYPE) return;

    const name = safeText(form.elements.categoryName?.value);
    if (!name) return;

    const state = readState();
    const exists = state.categories.some((cat) => String(cat.name || '').trim().toLowerCase() === name.toLowerCase() && String(cat.type || '').trim().toLowerCase() === LOAN_TYPE);
    if (!exists) {
      state.categories.push({
        id: makeId('cat'),
        name,
        type: LOAN_TYPE
      });
      saveState(state);
    }
  };

  const handleTransactionSubmit = (event) => {
    const form = event.target;
    if (!form || form.id !== 'transactionForm') return;

    const selectedMode = form.querySelector('.transaction-tab.active')?.dataset.mode || 'standard';
    const category = String(form.querySelector('select[name="category"]')?.value || '').trim();
    const amount = num(form.querySelector('input[name="amount"]')?.value);
    const note = safeText(form.querySelector('input[name="note"]')?.value);
    const date = form.querySelector('input[name="date"]')?.value || new Date().toISOString().slice(0, 10);

    if (selectedMode === 'repayment') {
      const loanId = String(form.querySelector('select[name="loanId"]')?.value || '').trim();
      const repaymentAmount = num(form.querySelector('input[name="repaymentAmount"]')?.value);

      if (!loanId || repaymentAmount <= 0) return;

      const state = readState();
      const loan = state.loans.find((item) => String(item.id) === loanId);
      if (!loan) return;

      const tx = {
        id: makeId('tx'),
        type: 'expense',
        category: LOAN_REPAYMENT_NAME,
        amount: repaymentAmount,
        date,
        note: note || `Repayment - ${loan.name || 'Loan'}`,
        loanId,
        createdAt: new Date().toISOString()
      };

      state.transactions.push(tx);
      applyRepayment(state, tx);
      saveState(state);
      refreshLoanSelect();
      return;
    }

    if (category.toLowerCase() === LOAN_CATEGORY_NAME.toLowerCase()) {
      const state = readState();
      const loanName = note || 'Loan';
      const tx = {
        id: makeId('tx'),
        type: 'income',
        category: LOAN_CATEGORY_NAME,
        amount,
        date,
        note: loanName,
        loanId: makeId('loan'),
        createdAt: new Date().toISOString()
      };

      if (amount > 0) {
        state.transactions.push(tx);
        createLoanFromIncome(state, tx);
        saveState(state);
        refreshLoanSelect();
      }
    }
  };

  const init = () => {
    ensureLoanTypeOption();
    ensureLoanCategory();
    populateCategorySelect();
    refreshLoanSelect();

    document.addEventListener('submit', (event) => {
      if (event.target && event.target.id === 'categoryForm') {
        handleCategorySubmit(event);
      }
      if (event.target && event.target.id === 'transactionForm') {
        handleTransactionSubmit(event);
      }
    }, true);

    document.addEventListener('change', (event) => {
      if (event.target && event.target.name === 'categoryType') {
        ensureLoanTypeOption();
      }
      if (event.target && event.target.id === 'transactionForm') {
        populateCategorySelect();
      }
      if (event.target && event.target.name === 'loanId') {
        refreshLoanSelect();
      }
    }, true);

    window.addEventListener('moneyflow:state-updated', () => {
      populateCategorySelect();
      refreshLoanSelect();
    });

    document.addEventListener('click', (event) => {
      const tab = event.target.closest('.transaction-tab[data-mode="repayment"]');
      if (tab) {
        setTimeout(refreshLoanSelect, 0);
      }
    }, true);

    reconcileLoansFromTransactions();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
