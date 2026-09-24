(() => {
  'use strict';

  const KEY = 'moneyflow-v3';
  const $ = (selector, root = document) => root.querySelector(selector);
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; }
  };
  const write = (state) => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  };
  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const text = (value) => String(value ?? '').trim();
  const toast = (message, error = false) => {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.style.borderColor = error ? 'rgba(239,93,114,.28)' : 'var(--line)';
    node.classList.add('show');
    clearTimeout(node._runtimeTimer);
    node._runtimeTimer = setTimeout(() => node.classList.remove('show'), 2800);
  };
  const state = () => {
    const current = read();
    current.settings = current.settings || {};
    current.transactions = Array.isArray(current.transactions) ? current.transactions : [];
    current.categories = Array.isArray(current.categories) ? current.categories : [];
    current.budgets = Array.isArray(current.budgets) ? current.budgets : [];
    current.loans = Array.isArray(current.loans) ? current.loans : [];
    return current;
  };
  const refresh = () => {
    window.dispatchEvent(new Event('moneyflow:state-updated'));
    window.dispatchEvent(new Event('storage'));
    setTimeout(() => window.location.reload(), 0);
  };

  async function syncFromSheet() {
    const current = state();
    const url = text(current.settings.syncUrl);
    if (!url) return toast('Add the Apps Script URL in Settings.', true);

    const button = $('#syncButton');
    const status = $('#syncStatus');
    if (button) button.disabled = true;
    if (status) { status.textContent = 'Syncing…'; status.dataset.status = 'loading'; }

    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=getAll`, { method: 'GET', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || `Sync failed (${response.status})`);

      const data = result.data;
      current.transactions = Array.isArray(data.transactions) ? data.transactions : current.transactions;
      current.categories = Array.isArray(data.categories) && data.categories.length ? data.categories : current.categories;
      current.budgets = Array.isArray(data.budgets) ? data.budgets : current.budgets;
      current.loans = Array.isArray(data.loans) ? data.loans : current.loans;
      write(current);
      if (status) { status.textContent = 'Synced'; status.dataset.status = 'success'; }
      toast('Data loaded from Google Sheets.');
      refresh();
    } catch (error) {
      if (status) { status.textContent = 'Sync failed'; status.dataset.status = 'error'; }
      toast(error.message || 'Unable to load Google Sheets data.', true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function ensureLoanCategory() {
    const current = state();
    if (!current.categories.some((item) => text(item.name).toLowerCase() === 'loan' && text(item.type).toLowerCase() === 'loan')) {
      current.categories.push({ id: id('cat'), name: 'Loan', type: 'loan' });
      write(current);
    }
  }

  function ensureLoanOption() {
    const form = $('#transactionForm');
    const category = form?.querySelector('select[name="category"]');
    if (category && !Array.from(category.options).some((option) => option.value.toLowerCase() === 'loan')) {
      const option = document.createElement('option');
      option.value = 'Loan';
      option.textContent = 'Loan';
      category.appendChild(option);
    }
    const type = form?.querySelector('select[name="type"]');
    if (type && !Array.from(type.options).some((option) => option.value === 'loan')) {
      const option = document.createElement('option');
      option.value = 'loan';
      option.textContent = 'Loan';
      type.appendChild(option);
    }
  }

  function addLoanTab(modal) {
    if (!modal || modal.querySelector('[data-mode="loan"]')) return;
    const tabs = $('.transaction-tabs', modal);
    const fields = $('#repaymentFields', modal);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'transaction-tab';
    button.dataset.mode = 'loan';
    button.textContent = 'New loan';
    tabs?.appendChild(button);
    button.addEventListener('click', () => {
      modal.querySelectorAll('.transaction-tab').forEach((item) => item.classList.toggle('active', item === button));
      fields?.classList.add('hidden');
      const type = $('select[name="type"]', modal);
      const category = $('select[name="category"]', modal);
      if (type) type.value = 'income';
      if (category) category.value = 'Loan';
    });
  }

  function ensureManagementControls() {
    const budgetForm = $('#budgetForm');
    const categoryForm = $('#categoryForm');
    if (budgetForm && !$('#runtimeBudgetSelect')) {
      const select = document.createElement('select');
      select.id = 'runtimeBudgetSelect';
      select.setAttribute('aria-label', 'Select budget to edit or delete');
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'secondary-btn'; edit.textContent = 'Edit selected';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'danger-btn'; remove.textContent = 'Delete selected';
      const row = document.createElement('div'); row.className = 'settings-action-buttons';
      row.append(select, edit, remove); budgetForm.appendChild(row);
      const populate = () => {
        const current = state();
        select.innerHTML = current.budgets.map((item) => `<option value="${item.id}">${item.category} · ${item.month} · ${num(item.amount).toLocaleString()} MMK</option>`).join('') || '<option value="">No budgets</option>';
      };
      populate();
      edit.addEventListener('click', () => {
        const current = state(); const item = current.budgets.find((entry) => entry.id === select.value); if (!item) return;
        const category = window.prompt('Budget category', item.category); if (category === null) return;
        const month = window.prompt('Budget month (YYYY-MM)', item.month); if (month === null) return;
        const amount = window.prompt('Budget amount', item.amount); if (amount === null) return;
        if (!text(category) || !/^\d{4}-\d{2}$/.test(month) || num(amount) <= 0) return toast('Enter valid budget details.', true);
        Object.assign(item, { category: text(category), month, amount: num(amount) }); write(current); refresh();
      });
      remove.addEventListener('click', () => {
        const current = state(); const item = current.budgets.find((entry) => entry.id === select.value); if (!item) return;
        if (!window.confirm(`Delete budget "${item.category}"?`)) return;
        current.budgets = current.budgets.filter((entry) => entry.id !== item.id); write(current); refresh();
      });
    }
    if (categoryForm && !$('#runtimeCategorySelect')) {
      const select = document.createElement('select'); select.id = 'runtimeCategorySelect'; select.setAttribute('aria-label', 'Select category to edit or delete');
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-btn'; edit.textContent = 'Edit selected';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-btn'; remove.textContent = 'Delete selected';
      const row = document.createElement('div'); row.className = 'settings-action-buttons'; row.append(select, edit, remove); categoryForm.appendChild(row);
      const populate = () => { const current = state(); select.innerHTML = current.categories.map((item) => `<option value="${item.id}">${item.name} · ${item.type}</option>`).join('') || '<option value="">No categories</option>'; };
      populate();
      edit.addEventListener('click', () => {
        const current = state(); const item = current.categories.find((entry) => entry.id === select.value); if (!item) return;
        const name = window.prompt('Category name', item.name); if (name === null) return;
        const type = window.prompt('Category type (income, expense, or loan)', item.type); if (type === null) return;
        const cleanType = text(type).toLowerCase(); if (!text(name) || !['income', 'expense', 'loan'].includes(cleanType)) return toast('Enter valid category details.', true);
        item.name = text(name); item.type = cleanType; write(current); refresh();
      });
      remove.addEventListener('click', () => {
        const current = state(); const item = current.categories.find((entry) => entry.id === select.value); if (!item) return;
        if (item.name.toLowerCase() === 'loan' || !window.confirm(`Delete category "${item.name}"?`)) return;
        current.categories = current.categories.filter((entry) => entry.id !== item.id); write(current); refresh();
      });
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#syncButton')) {
      event.preventDefault(); event.stopImmediatePropagation(); syncFromSheet();
    }
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form || form.id !== 'transactionForm') return;
    const loanTab = $('.transaction-tab[data-mode="loan"]', form.closest('#transactionModal'));
    if (!loanTab?.classList.contains('active')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = state();
    const amount = num(form.querySelector('[name="amount"]')?.value);
    if (amount <= 0) return toast('Enter a valid loan amount.', true);
    const loanId = id('loan');
    const date = form.querySelector('[name="date"]')?.value || new Date().toISOString().slice(0, 10);
    const name = text(form.querySelector('[name="note"]')?.value) || 'Loan';
    current.transactions.push({ id: id('tx'), type: 'income', category: 'Loan', amount, date, note: name, loanId, createdAt: new Date().toISOString() });
    current.loans.push({ id: loanId, name, principal: amount, paid: 0, balance: amount, remaining: amount, date, note: name, createdAt: new Date().toISOString() });
    write(current); toast('Loan saved.'); refresh();
  }, true);

  const boot = () => {
    ensureLoanCategory();
    ensureLoanOption();
    ensureManagementControls();
    const observer = new MutationObserver(() => { ensureLoanOption(); addLoanTab($('#transactionModal')); ensureManagementControls(); });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
