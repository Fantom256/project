let currentLesson = null;

function getToken() {
  return localStorage.getItem('token');
}

function getLessonId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('lesson_id'));
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
    alert('Сессия истекла. Войдите заново.');
    localStorage.clear();
    location.href = 'login.html';
    throw new Error('401 Unauthorized');
  }

  if (!res.ok) {
    throw new Error(json.error || 'Ошибка запроса');
  }

  return json;
}

function renderLesson(data) {
  currentLesson = data;

  document.getElementById('lessonMeta').textContent =
    `Урок ${data.lesson_order}`;
  document.getElementById('lessonTitle').textContent =
    data.title;

  document.getElementById('lessonContent').innerHTML = data.content || '<p>Содержимое урока отсутствует.</p>';

  const statusEl = document.getElementById('lessonStatus');
  statusEl.innerHTML = data.is_completed
    ? '<span class="badge text-bg-success">Урок пройден</span>'
    : '<span class="badge text-bg-warning">Урок ещё не завершён</span>';

  const backBtn = document.getElementById('backToCourseBtn');
  backBtn.href = `course-view.html?course_id=${data.course_id}`;

  const prevBtn = document.getElementById('prevLessonBtn');
  const nextBtn = document.getElementById('nextLessonBtn');

  if (data.previous_lesson) {
    prevBtn.classList.remove('d-none');
    prevBtn.href = `lesson.html?lesson_id=${data.previous_lesson.lesson_id}`;
  } else {
    prevBtn.classList.add('d-none');
  }

  if (data.next_lesson) {
    nextBtn.classList.remove('d-none');
    nextBtn.href = `lesson.html?lesson_id=${data.next_lesson.lesson_id}`;
  } else {
    nextBtn.classList.add('d-none');
  }

  const completeBtn = document.getElementById('completeLessonBtn');
  if (data.is_completed) {
    completeBtn.disabled = true;
    completeBtn.textContent = 'Урок уже завершён';
  } else {
    completeBtn.disabled = false;
    completeBtn.textContent = 'Завершить урок';
  }
}

async function completeLesson() {
  if (!currentLesson) return;

  try {
    const completeBtn = document.getElementById('completeLessonBtn');
    completeBtn.disabled = true;
    completeBtn.textContent = 'Сохраняем...';

    await fetchJson(`/api/lessons/${currentLesson.lesson_id}/complete`, {
      method: 'PATCH'
    });

    alert('Урок отмечен как завершённый.');
    await loadLesson();
  } catch (e) {
    console.error(e);
    alert(e.message || 'Ошибка завершения урока');
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
      alert('Не передан lesson_id');
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
  document.getElementById('completeLessonBtn').addEventListener('click', completeLesson);
  loadLesson();
});