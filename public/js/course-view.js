function getToken() {
  return localStorage.getItem('token');
}

function getCourseId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('course_id'));
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

function renderProgress(progress) {
  const percent = progress.progress_percent || 0;
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressDetails = document.getElementById('progressDetails');

  progressBar.style.width = percent + '%';
  progressBar.setAttribute('aria-valuenow', percent);
  progressBar.textContent = percent + '%';

  progressText.textContent = percent + '%';
  progressDetails.textContent =
    `Выполнено ${progress.completed_lessons} из ${progress.total_lessons} уроков`;
}

function renderLessons(lessons) {
  const wrap = document.getElementById('lessonsList');
  wrap.innerHTML = '';

  if (!lessons.length) {
    wrap.innerHTML = '<div class="text-muted">Для этого курса уроки пока не добавлены.</div>';
    return;
  }

  lessons.forEach((lesson, index) => {
    const prevLesson = lessons[index - 1];
    const isUnlocked = index === 0 || prevLesson?.is_completed;
    const statusBadge = lesson.is_completed
      ? '<span class="badge text-bg-success">Пройден</span>'
      : isUnlocked
        ? '<span class="badge text-bg-warning">Доступен</span>'
        : '<span class="badge text-bg-secondary">Закрыт</span>';

    const actionBtn = isUnlocked
      ? `<a href="lesson.html?lesson_id=${lesson.lesson_id}" class="btn btn-primary btn-sm">Открыть урок</a>`
      : `<button class="btn btn-secondary btn-sm" disabled>Недоступно</button>`;

    wrap.insertAdjacentHTML('beforeend', `
      <div class="border rounded-4 p-3 bg-white">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-semibold mb-1">
  ${escapeHtml(lesson.title)}
</div>
          </div>

          <div class="d-flex align-items-center gap-2 flex-wrap">
            ${statusBadge}
            ${actionBtn}
          </div>
        </div>
      </div>
    `);
  });
}

async function loadCourseTitle(courseId, lessons) {
  const titleEl = document.getElementById('courseTitle');
  const subEl = document.getElementById('courseSubtitle');

  try {
    const courses = await fetch('/api/courses').then(r => r.json()).catch(() => []);
    const course = Array.isArray(courses)
      ? courses.find(c => Number(c.course_id) === Number(courseId))
      : null;

    if (course) {
      titleEl.textContent = course.title;
      subEl.textContent = course.description || 'Учебный курс';
      return;
    }
  } catch {}

  if (lessons.length) {
    titleEl.textContent = 'Учебный курс';
    subEl.textContent = `Всего уроков: ${lessons.length}`;
  } else {
    titleEl.textContent = 'Курс';
    subEl.textContent = 'Учебный модуль';
  }
}

async function loadCoursePage() {
  try {
    const token = getToken();
    if (!token) {
      location.href = 'login.html';
      return;
    }

    const courseId = getCourseId();
    if (!courseId) {
      alert('Не передан course_id');
      location.href = 'courses.html';
      return;
    }

    const [lessons, progress] = await Promise.all([
      fetchJson(`/api/lessons/course/${courseId}`),
      fetchJson(`/api/lessons/progress/${courseId}`)
    ]);

    await loadCourseTitle(courseId, lessons);
    renderProgress(progress);
    renderLessons(lessons);
  } catch (e) {
    console.error(e);
    document.getElementById('lessonsList').innerHTML =
      `<div class="alert alert-warning mb-0">${escapeHtml(e.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadCoursePage);
window.loadCoursePage = loadCoursePage;