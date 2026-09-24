(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';

  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignore storage failures.
    }
  };

  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

  const injectSettingsStyles = () => {
    if (document.getElementById('settings-live-fixes')) return;

    const style = document.createElement('style');
    style.id = 'settings-live-fixes';
    style.textContent = `
      #settings select,
      #settings input,
      #settings textarea,
      #settings .stack-form input,
      #settings .stack-form select {
        width: 100%;
        min-height: 42px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface-solid);
        color: var(--text);
        color-scheme: inherit;
        outline: none;
      }

      body.dark #settings select,
      body.dark #settings input,
      body.dark #settings textarea,
      body.dark #settings .stack-form input,
      body.dark #settings .stack-form select {
        background: rgba(7, 11, 22, 0.72);
        color: var(--text);
      }

      #settings select option {
        background: var(--surface-solid);
        color: var(--text);
      }

      body.dark #settings select option {
        background: #0d1424;
        color: #f2f6ff;
      }

      .settings-action-row {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .settings-action-row .settings-selector-label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: .85rem;
        font-weight: 700;
      }

      .settings-action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .settings-action-buttons button {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: rgba(148, 163, 184, 0.08);
        color: var(--text);
        padding: 0 12px;
        min-height: 36px;
        cursor: pointer;
      }

      .settings-action-buttons button:hover {
        border-color: rgba(79, 140, 255, 0.5);
      }

      .brand-mark {
        overflow: hidden;
      }

      .brand-mark img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: inherit;
      }
    `;
    document.head.appendChild(style);
  };

  const replaceBrandIcon = () => {
    const mark = document.querySelector('.brand-mark');
    if (!mark || mark.dataset.iconReady === 'true') return;

    mark.dataset.iconReady = 'true';
    mark.textContent = '';

    const image = document.createElement('img');
    image.src = 'icons/icon-192.png';
    image.alt = 'MoneyFlow';
    image.width = 38;
    image.height = 38;
    mark.appendChild(image);
  };

  const getBudget = (id) => {
    const state = readState();
    return (Array.isArray(state.budgets) ? state.budgets : [])
      .find((item) => String(item.id) === String(id));
  };

  const getCategory = (id) => {
    const state = readState();
    return (Array.isArray(state.categories) ? state.categories : [])
      .find((item) => String(item.id) === String(id));
  };

  const updateSelectedBudget = (selectedValue) => {
    const state = readState();
    const budgets = Array.isArray(state.budgets) ? state.budgets : [];
    const item = budgets.find((row) => String(row.id) === String(selectedValue));
    if (!item) return;

    const nextCategory = window.prompt('Edit budget category', item.category || '');
    if (nextCategory === null) return;
    const nextMonth = window.prompt('Edit budget month (YYYY-MM)', item.month || '');
    if (nextMonth === null) return;
    const nextAmount = window.prompt('Edit budget amount', String(item.amount ?? 0));
    if (nextAmount === null) return;

    const cleanCategory = String(nextCategory).trim();
    const cleanMonth = String(nextMonth).trim();
    const cleanAmount = num(nextAmount);
    if (!cleanCategory || !/^\d{4}-\d{2}$/.test(cleanMonth) || cleanAmount <= 0) return;

    item.category = cleanCategory;
    item.month = cleanMonth;
    item.amount = cleanAmount;
    saveState(state);
    window.location.reload();
  };

  const updateSelectedCategory = (selectedValue) => {
    const state = readState();
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const item = categories.find((row) => String(row.id) === String(selectedValue));
    if (!item) return;

    const nextName = window.prompt('Edit category name', item.name || '');
    if (nextName === null) return;
    const nextType = window.prompt('Edit category type (income or expense)', item.type || 'expense');
    if (nextType === null) return;

    const cleanName = String(nextName).trim();
    const cleanType = String(nextType).trim().toLowerCase();
    if (!cleanName || !['income', 'expense'].includes(cleanType)) return;
    if (categories.some((row) => row !== item && String(row.name || '').toLowerCase() === cleanName.toLowerCase())) return;

    item.name = cleanName;
    item.type = cleanType;
    saveState(state);
    window.location.reload();
  };

  const deleteSelectedBudget = (selectedValue) => {
    const state = readState();
    const budgets = Array.isArray(state.budgets) ? state.budgets : [];
    const target = budgets.find((row) => String(row.id) === String(selectedValue));
    if (!target || !window.confirm(`Delete budget "${target.category || 'this item'}"?`)) return;
    state.budgets = budgets.filter((row) => String(row.id) !== String(selectedValue));
    saveState(state);
    window.location.reload();
  };

  const deleteSelectedCategory = (selectedValue) => {
    const state = readState();
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const target = categories.find((row) => String(row.id) === String(selectedValue));
    if (!target || !window.confirm(`Delete category "${target.name || 'this item'}"?`)) return;
    state.categories = categories.filter((row) => String(row.id) !== String(selectedValue));
    saveState(state);
    window.location.reload();
  };

  const createSelector = (id, label, options, emptyText) => {
    const labelNode = document.createElement('label');
    labelNode.className = 'settings-selector-label';
    labelNode.htmlFor = id;
    labelNode.textContent = label;

    const select = document.createElement('select');
    select.id = id;
    select.innerHTML = options.length
      ? options
      : `<option value="">${emptyText}</option>`;

    labelNode.appendChild(select);
    return { labelNode, select };
  };

  const attachSettingsActions = () => {
    const settingsPage = document.getElementById('settings');
    if (!settingsPage) return;

    injectSettingsStyles();
    replaceBrandIcon();

    const state = readState();
    const budgets = Array.isArray(state.budgets) ? state.budgets : [];
    const categories = Array.isArray(state.categories) ? state.categories : [];

    const budgetForm = document.getElementById('budgetForm');
    if (budgetForm && !budgetForm.dataset.runtimeHooked) {
      budgetForm.dataset.runtimeHooked = 'true';
      const row = document.createElement('div');
      row.className = 'settings-action-row';

      const budgetSelector = createSelector(
        'budgetEditSelect',
        'Select budget to edit or delete',
        budgets.map((item) => `<option value="${esc(item.id)}">${esc(item.category)} · ${esc(item.month)} · ${num(item.amount).toLocaleString()} MMK</option>`),
        'No budgets available'
      );
      row.appendChild(budgetSelector.labelNode);

      const buttons = document.createElement('div');
      buttons.className = 'settings-action-buttons';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit selected budget';
      editButton.addEventListener('click', () => updateSelectedBudget(budgetSelector.select.value));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete selected budget';
      deleteButton.addEventListener('click', () => deleteSelectedBudget(budgetSelector.select.value));

      buttons.append(editButton, deleteButton);
      row.appendChild(buttons);
      budgetForm.appendChild(row);
    }

    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm && !categoryForm.dataset.runtimeHooked) {
      categoryForm.dataset.runtimeHooked = 'true';
      const row = document.createElement('div');
      row.className = 'settings-action-row';

      const categorySelector = createSelector(
        'categoryEditSelect',
        'Select category to edit or delete',
        categories.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.type)}</option>`),
        'No categories available'
      );
      row.appendChild(categorySelector.labelNode);

      const buttons = document.createElement('div');
      buttons.className = 'settings-action-buttons';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit selected category';
      editButton.addEventListener('click', () => updateSelectedCategory(categorySelector.select.value));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete selected category';
      deleteButton.addEventListener('click', () => deleteSelectedCategory(categorySelector.select.value));

      buttons.append(editButton, deleteButton);
      row.appendChild(buttons);
      categoryForm.appendChild(row);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSettingsActions, { once: true });
  } else {
    attachSettingsActions();
  }
})();
