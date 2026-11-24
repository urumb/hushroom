// tasks.js — the session task list: add, edit, complete, delete, reorder
// (drag or ↑/↓ buttons), mark one as "current focus", count sessions per task.

import { load, save } from './storage.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function createTasks({ form, input, list, count, clearBtn, onCurrentChange }) {
  let tasks = load('tasks', []);
  if (!Array.isArray(tasks)) tasks = [];
  tasks = tasks.filter((t) => t && typeof t.title === 'string').map((t) => ({
    id: String(t.id || uid()), title: t.title.slice(0, 120), done: !!t.done, sessions: Number(t.sessions) || 0,
  }));
  let currentId = load('current', null);
  let editingId = null;
  let dragId = null;

  const persist = () => { save('tasks', tasks); save('current', currentId); };
  const current = () => tasks.find((t) => t.id === currentId && !t.done) || null;

  function setCurrent(id) {
    currentId = currentId === id ? null : id;
    persist(); render(); onCurrentChange(current());
  }

  function move(id, delta) {
    const i = tasks.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= tasks.length) return;
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    persist(); render();
    list.querySelector(`[data-id="${id}"] [data-act="${delta < 0 ? 'up' : 'down'}"]`)?.focus();
  }

  function btn(act, label, svg, extra = '') {
    return `<button type="button" class="icon-btn small" data-act="${act}" aria-label="${label}" title="${label}" ${extra}>${svg}</button>`;
  }

  const ICON = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render() {
    if (!tasks.length) {
      list.innerHTML = '<li class="empty">Nothing here yet. Add the one thing you want to finish this session, then press the target to make it your focus.</li>';
    } else {
      list.innerHTML = tasks.map((t, i) => {
        const isCur = t.id === currentId && !t.done;
        const body = editingId === t.id
          ? `<input class="edit-input" type="text" maxlength="120" value="${esc(t.title)}" aria-label="Edit task title" />`
          : `<span class="task-title">${esc(t.title)}</span>`;
        return `<li class="task${t.done ? ' done' : ''}${isCur ? ' current' : ''}" data-id="${t.id}" draggable="${editingId ? 'false' : 'true'}">
          <input type="checkbox" class="check" aria-label="Mark “${esc(t.title)}” complete" ${t.done ? 'checked' : ''} />
          <div class="task-main">${body}${t.sessions ? `<span class="badge">${t.sessions} ${t.sessions === 1 ? 'session' : 'sessions'}</span>` : ''}</div>
          <div class="task-actions">
            ${t.done ? '' : btn('focus', isCur ? 'Stop focusing on this task' : 'Focus on this task', ICON.target, `aria-pressed="${isCur}"`)}
            ${btn('edit', 'Edit task', ICON.edit)}
            ${btn('up', 'Move up', ICON.up, i === 0 ? 'disabled' : '')}
            ${btn('down', 'Move down', ICON.down, i === tasks.length - 1 ? 'disabled' : '')}
            ${btn('del', 'Delete task', ICON.del)}
          </div></li>`;
      }).join('');
    }
    const open = tasks.filter((t) => !t.done).length;
    count.textContent = tasks.length ? `${open} open · ${tasks.length - open} done` : '';
    clearBtn.disabled = !tasks.some((t) => t.done);
    const ed = list.querySelector('.edit-input');
    if (ed) { ed.focus(); ed.select(); }
  }

  // ---- events (delegated) ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    const task = { id: uid(), title: title.slice(0, 120), done: false, sessions: 0 };
    tasks.push(task);
    if (!current()) { currentId = task.id; } // first open task becomes the focus automatically
    input.value = '';
    persist(); render(); onCurrentChange(current());
  });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    const li = e.target.closest('li[data-id]');
    if (!b || !li) return;
    const id = li.dataset.id;
    switch (b.dataset.act) {
      case 'focus': setCurrent(id); break;
      case 'edit': editingId = id; render(); break;
      case 'up': move(id, -1); break;
      case 'down': move(id, 1); break;
      case 'del':
        tasks = tasks.filter((t) => t.id !== id);
        if (currentId === id) currentId = null;
        persist(); render(); onCurrentChange(current());
        break;
    }
  });

  list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('check')) return;
    const t = tasks.find((x) => x.id === e.target.closest('li').dataset.id);
    if (!t) return;
    t.done = e.target.checked;
    persist(); render(); onCurrentChange(current());
  });

  list.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('edit-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.target); }
    else if (e.key === 'Escape') { e.stopPropagation(); editingId = null; render(); }
  });
  list.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('edit-input') && editingId) commitEdit(e.target);
  });
  function commitEdit(el) {
    const t = tasks.find((x) => x.id === editingId);
    const v = el.value.trim();
    editingId = null;
    if (t && v) t.title = v.slice(0, 120);
    persist(); render(); onCurrentChange(current());
  }

  // drag to reorder
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    dragId = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch { /* Safari quirk */ }
    li.classList.add('dragging');
  });
  list.addEventListener('dragover', (e) => { if (dragId) e.preventDefault(); });
  list.addEventListener('drop', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!dragId || !li || li.dataset.id === dragId) return;
    e.preventDefault();
    const from = tasks.findIndex((t) => t.id === dragId);
    const to = tasks.findIndex((t) => t.id === li.dataset.id);
    const [item] = tasks.splice(from, 1);
    tasks.splice(to, 0, item);
    persist(); render();
  });
  list.addEventListener('dragend', () => { dragId = null; list.querySelector('.dragging')?.classList.remove('dragging'); });

  clearBtn.addEventListener('click', () => {
    tasks = tasks.filter((t) => !t.done);
    persist(); render(); onCurrentChange(current());
  });

  render();
  return {
    current,
    /** Called when a focus session completes. */
    addSession() {
      const c = current();
      if (c) { c.sessions += 1; persist(); render(); }
      return c;
    },
  };
}
