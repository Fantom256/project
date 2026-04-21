let selectedThreadId = null;
let newThreadModal = null;

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...extra
  };
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showSupportToast(message, type = 'dark') {
  const toastEl = document.getElementById('supportToast');
  const toastBody = document.getElementById('supportToastBody');

  if (!toastEl || !toastBody) {
    alert(message);
    return;
  }

  toastBody.textContent = message;
  toastEl.className = 'toast border-0';

  const classMap = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning',
    dark: 'text-bg-dark'
  };

  toastEl.classList.add(classMap[type] || 'text-bg-dark');

  if (!window.bootstrap || !bootstrap.Toast) {
    alert(message);
    return;
  }

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
  toast.show();
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options.headers || {})
    }
  });

  const json = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.clear();
    location.href = 'login.html';
    throw new Error('Сессия истекла. Войдите заново.');
  }

  if (!res.ok) {
    throw new Error(json.error || 'Ошибка запроса');
  }

  return json;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function getStatusLabel(status) {
  return status === 'closed' ? 'Закрыто' : 'Открыто';
}

function getStatusBadge(status) {
  if (status === 'closed') {
    return `<span class="badge rounded-pill text-bg-secondary">Закрыто</span>`;
  }
  return `<span class="badge rounded-pill text-bg-success">Открыто</span>`;
}

async function loadThreads() {
  const list = document.getElementById('supportThreadsList');
  if (!list) return;

  list.innerHTML = `<div class="text-muted">Загрузка обращений...</div>`;

  try {
    const threads = await fetchJson('/api/support/my-threads');

    if (!Array.isArray(threads) || !threads.length) {
      list.innerHTML = `<div class="text-muted">У вас пока нет обращений.</div>`;
      return;
    }

    list.innerHTML = threads.map(thread => `
      <button
        class="support-thread-item ${selectedThreadId === thread.thread_id ? 'active' : ''}"
        data-thread-id="${thread.thread_id}"
        type="button"
      >
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div class="support-thread-subject">${escapeHtml(thread.subject)}</div>
          ${thread.unread_count > 0 ? `<span class="badge text-bg-primary rounded-pill">${thread.unread_count}</span>` : ''}
        </div>

        <div class="support-thread-status mt-2">
          ${getStatusBadge(thread.status)}
        </div>

        <div class="support-thread-last mt-2">
          ${escapeHtml(thread.last_message || 'Без сообщений')}
        </div>

        <div class="support-thread-date mt-2">
          ${formatDate(thread.updated_at)}
        </div>
      </button>
    `).join('');

    list.querySelectorAll('[data-thread-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedThreadId = Number(btn.dataset.threadId);
        loadThreads();
        loadMessages(selectedThreadId);
      });
    });

  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="alert alert-warning mb-0">${escapeHtml(e.message)}</div>`;
  }
}

function showEmptyState() {
  const empty = document.getElementById('supportEmptyState');
  const chat = document.getElementById('supportChatArea');

  if (empty) empty.style.display = 'flex';
  if (chat) chat.style.display = 'none';
}

function showChatArea() {
  const empty = document.getElementById('supportEmptyState');
  const chat = document.getElementById('supportChatArea');

  if (empty) empty.style.display = 'none';
  if (chat) chat.style.display = 'block';
}

async function loadMessages(threadId) {
  if (!threadId) {
    showEmptyState();
    return;
  }

  try {
    const data = await fetchJson(`/api/support/threads/${threadId}/messages`);

    showChatArea();

    const subjectEl = document.getElementById('supportThreadSubject');
    const metaEl = document.getElementById('supportThreadMeta');
    const messagesWrap = document.getElementById('supportMessages');
    const closeBtn = document.getElementById('closeThreadBtn');
    const replyText = document.getElementById('supportReplyText');
    const sendBtn = document.getElementById('sendReplyBtn');

    if (subjectEl) subjectEl.textContent = data.thread.subject;
    if (metaEl) {
      metaEl.innerHTML = `${getStatusBadge(data.thread.status)} <span class="ms-2">Создано: ${formatDate(data.thread.created_at)}</span>`;
    }

    if (closeBtn) {
      closeBtn.disabled = data.thread.status === 'closed';
    }

    if (replyText) {
      replyText.disabled = data.thread.status === 'closed';
      replyText.placeholder = data.thread.status === 'closed'
        ? 'Обращение закрыто'
        : 'Введите сообщение...';
    }

    if (sendBtn) {
      sendBtn.disabled = data.thread.status === 'closed';
    }

    if (messagesWrap) {
      const messages = Array.isArray(data.messages) ? data.messages : [];

      if (!messages.length) {
        messagesWrap.innerHTML = `<div class="text-muted">Сообщений пока нет.</div>`;
      } else {
        messagesWrap.innerHTML = messages.map(msg => {
          const isUser = msg.sender_role === 'student';
          return `
            <div class="support-message ${isUser ? 'user' : 'manager'}">
              <div class="support-message-bubble">
                <div class="support-message-role">
                  ${isUser ? 'Вы' : 'Менеджер'}
                </div>
                <div class="support-message-text">${escapeHtml(msg.message_text)}</div>
                <div class="support-message-date">${formatDate(msg.created_at)}</div>
              </div>
            </div>
          `;
        }).join('');
      }

      messagesWrap.scrollTop = messagesWrap.scrollHeight;
    }

  } catch (e) {
    console.error(e);
    showSupportToast(e.message || 'Ошибка загрузки сообщений', 'danger');
  }
}

async function createThread(e) {
  e.preventDefault();

  const subjectInput = document.getElementById('newThreadSubject');
  const messageInput = document.getElementById('newThreadMessage');
  const createBtn = document.getElementById('createThreadBtn');

  const subject = subjectInput.value.trim();
  const messageText = messageInput.value.trim();

  if (!subject || !messageText) {
    showSupportToast('Заполни тему и сообщение.', 'warning');
    return;
  }

  try {
    createBtn.disabled = true;
    createBtn.textContent = 'Создание...';

    const result = await fetchJson('/api/support/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject,
        message_text: messageText
      })
    });

    subjectInput.value = '';
    messageInput.value = '';

    if (newThreadModal) {
      newThreadModal.hide();
    }

    selectedThreadId = result.thread.thread_id;
    await loadThreads();
    await loadMessages(selectedThreadId);

    showSupportToast('Обращение создано.', 'success');
  } catch (e) {
    console.error(e);
    showSupportToast(e.message || 'Ошибка создания обращения', 'danger');
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Создать';
  }
}

async function sendReply(e) {
  e.preventDefault();

  if (!selectedThreadId) {
    showSupportToast('Сначала выберите обращение.', 'warning');
    return;
  }

  const textEl = document.getElementById('supportReplyText');
  const sendBtn = document.getElementById('sendReplyBtn');
  const messageText = textEl.value.trim();

  if (!messageText) {
    showSupportToast('Сообщение не должно быть пустым.', 'warning');
    return;
  }

  try {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Отправка...';

    await fetchJson(`/api/support/threads/${selectedThreadId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message_text: messageText
      })
    });

    textEl.value = '';
    await loadMessages(selectedThreadId);
    await loadThreads();

  } catch (e) {
    console.error(e);
    showSupportToast(e.message || 'Ошибка отправки сообщения', 'danger');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Отправить';
  }
}

async function closeThread() {
  if (!selectedThreadId) return;

  try {
    await fetchJson(`/api/support/threads/${selectedThreadId}/close`, {
      method: 'PATCH'
    });

    await loadMessages(selectedThreadId);
    await loadThreads();

    showSupportToast('Обращение закрыто.', 'success');
  } catch (e) {
    console.error(e);
    showSupportToast(e.message || 'Ошибка закрытия обращения', 'danger');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    location.href = 'login.html';
    return;
  }

  const modalEl = document.getElementById('newThreadModal');
  if (window.bootstrap && modalEl) {
    newThreadModal = new bootstrap.Modal(modalEl);
  }

  const openBtns = [
    document.getElementById('openNewThreadBtn'),
    document.getElementById('openNewThreadBtn2')
  ];

  openBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        if (newThreadModal) newThreadModal.show();
      });
    }
  });

  const refreshBtn = document.getElementById('refreshThreadsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadThreads);
  }

  const newThreadForm = document.getElementById('newThreadForm');
  if (newThreadForm) {
    newThreadForm.addEventListener('submit', createThread);
  }

  const replyForm = document.getElementById('supportReplyForm');
  if (replyForm) {
    replyForm.addEventListener('submit', sendReply);
  }

  const closeBtn = document.getElementById('closeThreadBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeThread);
  }

  await loadThreads();
  showEmptyState();
});