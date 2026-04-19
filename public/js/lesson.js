let currentLesson = null;
let practicePassed = false;
let rewardModal = null;
let rewardContinueUrl = null;
let toastInstance = null;

function getToken() {
  return localStorage.getItem('token');
}

function getLessonId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('lesson_id'));
}

function getCodeStorageKey() {
  const lessonId = getLessonId();
  return `lesson_code_${lessonId}`;
}

function getPracticePassedStorageKey() {
  const lessonId = getLessonId();
  return `lesson_practice_passed_${lessonId}`;
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
  const token = getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
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

function showToast(message, type = 'dark') {
  const toastEl = document.getElementById('lessonToast');
  const toastBody = document.getElementById('lessonToastBody');
  if (!toastEl || !toastBody || !window.bootstrap) return;

  toastBody.textContent = message;
  toastEl.className = 'toast align-items-center border-0';

  const classMap = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning',
    dark: 'text-bg-dark'
  };

  toastEl.classList.add(classMap[type] || 'text-bg-dark');

  if (!toastInstance) {
    toastInstance = new bootstrap.Toast(toastEl, { delay: 3500 });
  }

  toastInstance.show();
}

function showCheckResult(type, text) {
  const checkResult = document.getElementById('checkResult');
  if (!checkResult) return;

  checkResult.className = 'alert mb-0';
  checkResult.classList.remove('d-none');

  if (type === 'success') {
    checkResult.classList.add('alert-success');
  } else if (type === 'warning') {
    checkResult.classList.add('alert-warning');
  } else {
    checkResult.classList.add('alert-danger');
  }

  checkResult.style.whiteSpace = 'pre-wrap';
  checkResult.textContent = text;
}

function hideCheckResult() {
  const checkResult = document.getElementById('checkResult');
  if (!checkResult) return;

  checkResult.className = 'alert d-none mb-0';
  checkResult.textContent = '';
}

function getNextNavigationUrl() {
  if (currentLesson?.next_lesson?.lesson_id) {
    return `lesson.html?lesson_id=${currentLesson.next_lesson.lesson_id}`;
  }

  return 'cabinet.html';
}

function showRewardModal(gamification) {
  const modalTitle = document.getElementById('lessonRewardModalTitle');
  const modalBody = document.getElementById('lessonRewardModalBody');
  const continueBtn = document.getElementById('lessonRewardContinueBtn');

  if (!modalTitle || !modalBody || !continueBtn || !rewardModal) return;

  const xpEarned = Number(gamification?.xp_earned || 0);
  const level = Number(gamification?.level || 1);
  const streakDays = Number(gamification?.streak_days || 0);
  const unlocked = Array.isArray(gamification?.unlocked_achievements)
    ? gamification.unlocked_achievements
    : [];

  rewardContinueUrl = getNextNavigationUrl();

  const isCourseCompleted = !!gamification?.course_completed;

  modalTitle.textContent = isCourseCompleted ? 'Курс завершён!' : 'Награда за урок';
  continueBtn.textContent = currentLesson?.next_lesson ? 'К следующему уроку' : 'В кабинет';

  modalBody.innerHTML = `
    <div class="text-center mb-3">
      <div style="font-size: 3rem;">${isCourseCompleted ? '🎓' : '🏆'}</div>
      <div class="fw-bold fs-5 mt-2">
        ${isCourseCompleted ? 'Поздравляем с завершением курса!' : 'Урок успешно завершён!'}
      </div>
    </div>

    <div class="border rounded-3 p-3 mb-3 bg-light">
      <div class="mb-2">+<b>${xpEarned}</b> XP</div>
      <div class="mb-2">Текущий уровень: <b>${level}</b></div>
      <div>Серия дней: <b>${streakDays}</b></div>
    </div>

    ${
      unlocked.length
        ? `
          <div class="mb-2 fw-semibold">Новые достижения:</div>
          <div class="d-flex flex-column gap-2">
            ${unlocked.map(a => `
              <div class="border rounded-3 p-2">
                <div class="fw-semibold">${a.icon || '🏆'} ${a.title}</div>
                <div class="small text-muted">${a.description}</div>
              </div>
            `).join('')}
          </div>
        `
        : ''
    }

    ${
      isCourseCompleted
        ? `
          <div class="alert alert-success mt-3 mb-0">
            Ты прошёл все уроки этого курса. Отличная работа!
          </div>
        `
        : ''
    }
  `;

  rewardModal.show();
}

function updateLessonStatus(data) {
  const statusEl = document.getElementById('lessonStatus');
  if (!statusEl) return;

  if (data.is_completed) {
    statusEl.innerHTML = '<span class="badge text-bg-success">Урок пройден</span>';
    return;
  }

  if (practicePassed) {
    statusEl.innerHTML = '<span class="badge text-bg-info">Код проверен, можно перейти дальше</span>';
    return;
  }

  statusEl.innerHTML = '<span class="badge text-bg-warning">Сначала нужно успешно пройти проверку кода</span>';
}

function updateActionButtons(data) {
  const nextBtn = document.getElementById('nextLessonBtn');
  if (!nextBtn) return;

  nextBtn.classList.remove('d-none');

  if (data.is_completed) {
  nextBtn.disabled = false;
  nextBtn.textContent = data.next_lesson ? 'Следующий урок' : 'В кабинет';
  return;
}

if (practicePassed) {
  nextBtn.disabled = false;
  nextBtn.textContent = data.next_lesson ? 'Следующий урок' : 'Завершить курс';
  return;
}

  nextBtn.disabled = true;
  nextBtn.textContent = 'Сначала пройди проверку';
}

function restoreSavedCode() {
  const codeEditor = document.getElementById('codeEditor');
  if (!codeEditor) return;

  const savedCode = localStorage.getItem(getCodeStorageKey());
  if (savedCode) {
    codeEditor.value = savedCode;
  }
}

function restorePracticePassed(data) {
  if (data.is_completed || data.practice_passed) {
    practicePassed = true;
    return;
  }

  practicePassed = false;
}

function setupCodeAutosave() {
  const codeEditor = document.getElementById('codeEditor');
  if (!codeEditor) return;

  codeEditor.addEventListener('input', () => {
    localStorage.setItem(getCodeStorageKey(), codeEditor.value);

    if (practicePassed && currentLesson && !currentLesson.is_completed) {
      practicePassed = false;
      localStorage.removeItem(getPracticePassedStorageKey());
      updateLessonStatus(currentLesson);
      updateActionButtons(currentLesson);
      showCheckResult('warning', 'Код был изменён. Пройди проверку заново.');
    }
  });
}

function renderLesson(data) {
  currentLesson = data;
  restorePracticePassed(data);

  document.getElementById('lessonMeta').textContent = `Урок ${data.lesson_order}`;
  document.getElementById('lessonTitle').textContent = data.title;

  document.getElementById('lessonContent').innerHTML =
    data.content || '<p>Содержимое урока отсутствует.</p>';

  updateLessonStatus(data);
  updateActionButtons(data);

  const backBtn = document.getElementById('backToCourseBtn');
  backBtn.href = `course-view.html?course_id=${data.course_id}`;

  const prevBtn = document.getElementById('prevLessonBtn');

  if (data.previous_lesson) {
    prevBtn.classList.remove('d-none');
    prevBtn.href = `lesson.html?lesson_id=${data.previous_lesson.lesson_id}`;
  } else {
    prevBtn.classList.add('d-none');
    prevBtn.removeAttribute('href');
  }

  restoreSavedCode();
  hideCheckResult();
}

async function checkCode() {
  if (!currentLesson) return;

  const codeEditor = document.getElementById('codeEditor');
  const checkBtn = document.getElementById('checkCodeBtn');

  if (!codeEditor || !checkBtn) return;

  const code = codeEditor.value.trim();

  if (!code) {
    showCheckResult('warning', 'Сначала введи код.');
    return;
  }

  try {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Проверка...';

    const result = await fetchJson(`/api/lessons/${currentLesson.lesson_id}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });

    if (result.success) {
      practicePassed = true;
      localStorage.setItem(getPracticePassedStorageKey(), 'true');
      showCheckResult('success', result.message || 'Все тесты пройдены.');
      updateLessonStatus(currentLesson);
      updateActionButtons(currentLesson);
    } else {
      practicePassed = false;
      localStorage.removeItem(getPracticePassedStorageKey());

      let text = result.message || 'Проверка не пройдена';

      if (result.expected !== undefined && result.actual !== undefined) {
        text += `\n\nОжидалось:\n${result.expected}\n\nПолучено:\n${result.actual}`;
      }

      if (result.error) {
        text += `\n\nОшибка:\n${result.error}`;
      }

      showCheckResult('error', text);
      updateLessonStatus(currentLesson);
      updateActionButtons(currentLesson);
    }
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Ошибка проверки кода', 'danger');
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = 'Проверить код';
  }
}

function clearCode() {
  const codeEditor = document.getElementById('codeEditor');
  if (!codeEditor) return;

  codeEditor.value = '';
  practicePassed = false;

  localStorage.removeItem(getCodeStorageKey());
  localStorage.removeItem(getPracticePassedStorageKey());

  hideCheckResult();

  if (currentLesson) {
    updateLessonStatus(currentLesson);
    updateActionButtons(currentLesson);
  }
}

async function goNextLesson() {
  if (!currentLesson) return;

  const nextBtn = document.getElementById('nextLessonBtn');
  if (!nextBtn) return;

  if (currentLesson.is_completed) {
    location.href = getNextNavigationUrl();
    return;
  }

  if (!practicePassed) {
    showToast('Сначала успешно пройди проверку кода.', 'warning');
    return;
  }

  try {
    nextBtn.disabled = true;
    nextBtn.textContent = 'Сохраняем...';

    const result = await fetchJson(`/api/lessons/${currentLesson.lesson_id}/complete`, {
      method: 'PATCH'
    });

    localStorage.removeItem(getPracticePassedStorageKey());

    await loadLesson();

    if (result.gamification) {
      showRewardModal(result.gamification);
    } else {
      location.href = getNextNavigationUrl();
    }
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Ошибка завершения урока', 'danger');
    updateActionButtons(currentLesson);
  }
}

async function loadLesson() {
  try {
    const token = getToken();
    if (!token) {
      location.href = 'login.html';
      return;
    }

    const lessonId = getLessonId();
    if (!lessonId) {
      showToast('Не передан lesson_id', 'danger');
      location.href = 'courses.html';
      return;
    }

    const data = await fetchJson(`/api/lessons/${lessonId}`);
    renderLesson(data);
  } catch (e) {
    console.error(e);
    document.getElementById('lessonContent').innerHTML =
      `<div class="alert alert-warning mb-0">${escapeHtml(e.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const checkBtn = document.getElementById('checkCodeBtn');
  const clearBtn = document.getElementById('clearCodeBtn');
  const nextBtn = document.getElementById('nextLessonBtn');
  const continueBtn = document.getElementById('lessonRewardContinueBtn');
  const modalEl = document.getElementById('lessonRewardModal');

  if (window.bootstrap && modalEl) {
    rewardModal = new bootstrap.Modal(modalEl);
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (rewardModal) {
        rewardModal.hide();
      }

      if (rewardContinueUrl) {
        location.href = rewardContinueUrl;
      }
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener('click', checkCode);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearCode);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', goNextLesson);
  }

  setupCodeAutosave();
  loadLesson();
});