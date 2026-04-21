function getCourseCoverMeta(course) {
  const title = String(course.title || '').toLowerCase();
  const category = String(course.category_name || '').toLowerCase();

  if (title.includes('python')) {
    return {
      className: 'course-cover-python',
      label: 'Python',
      code: 'PYTHON',
      subtitle: 'Практика • Код • Проекты'
    };
  }

  if (title.includes('javascript') || title.includes('js')) {
    return {
      className: 'course-cover-js',
      label: 'Frontend',
      code: 'JS',
      subtitle: 'DOM • API • Интерактив'
    };
  }

  if (title.includes('html') || title.includes('css')) {
    return {
      className: 'course-cover-html',
      label: 'Web',
      code: 'HTML/CSS',
      subtitle: 'Верстка • Стили • Адаптив'
    };
  }

  if (title.includes('c++') || title.includes('с++')) {
    return {
      className: 'course-cover-cpp',
      label: 'Programming',
      code: 'C++',
      subtitle: 'Логика • ООП • Практика'
    };
  }

  if (
    title.includes('собесед') ||
    title.includes('подготовка задач') ||
    title.includes('интерв')
  ) {
    return {
      className: 'course-cover-interview',
      label: 'Interview',
      code: 'PREP',
      subtitle: 'Задачи • Разбор • Подходы'
    };
  }

  if (title.includes('алгоритм') || category.includes('алгоритм')) {
    return {
      className: 'course-cover-algo',
      label: 'Algorithms',
      code: 'ALGO',
      subtitle: 'Структуры • Сортировки • Логика'
    };
  }

  return {
    className: 'course-cover-default',
    label: category || 'Course',
    code: (course.title || 'COURSE').slice(0, 12).toUpperCase(),
    subtitle: 'Современное обучение'
  };
}

function renderCourseCover(course) {
  const meta = getCourseCoverMeta(course);

  return `
    <div class="course-cover ${meta.className}">
      <div class="course-cover-grid"></div>

      <div class="course-cover-top">
        <span class="course-cover-label">${meta.label}</span>
      </div>

      <div class="course-cover-bottom">
        <div class="course-cover-code">${meta.code}</div>
        <div class="course-cover-title">${meta.subtitle}</div>
      </div>
    </div>
  `;
}

function showCoursesToast(message, type = 'dark') {
  let container = document.getElementById('coursesToastContainer');
  let toastEl = document.getElementById('coursesToast');
  let toastBody = document.getElementById('coursesToastBody');

  if (!container) {
    container = document.createElement('div');
    container.id = 'coursesToastContainer';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.innerHTML = `
      <div id="coursesToast" class="toast border-0 text-bg-dark" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body" id="coursesToastBody"></div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    toastEl = document.getElementById('coursesToast');
    toastBody = document.getElementById('coursesToastBody');
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

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2800 });
  toast.show();
}

async function loadCourses() {
  const root = document.getElementById('coursesRoot');
  root.innerHTML = `<div class="text-muted">Загрузка...</div>`;

  try {
    const res = await fetch('/api/courses/by-category');
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    const cats = Object.keys(data || {});

    if (!cats.length) {
      root.innerHTML = `<div class="alert alert-info">Пока курсов нет. Добавь записи в БД — они появятся тут.</div>`;
      return;
    }

    root.innerHTML = '';

    for (const catName of cats) {
      const section = document.createElement('section');
      section.className = 'card cs-card p-3 p-md-4';

      section.innerHTML = `
        <h3 class="mb-3">${catName}</h3>
        <div class="row g-3" data-cat="${catName}"></div>
      `;

      const row = section.querySelector('.row');

      data[catName].forEach((c) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';

        col.innerHTML = `
          <div class="card h-100 cs-card course-card p-3">
            ${renderCourseCover(c)}

            <div class="mt-3">
              <h5 class="mb-2">${c.title}</h5>
              <p class="text-muted mb-3">${c.description}</p>

              <div class="d-flex justify-content-between align-items-center">
                <div><b>${c.price}</b> руб.</div>
                <button class="btn btn-primary btn-sm" data-enroll="${c.course_id}">
                  Записаться
                </button>
              </div>
            </div>
          </div>
        `;

        row.appendChild(col);
      });

      root.appendChild(section);
    }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-enroll]');
      if (!btn) return;
      enroll(Number(btn.dataset.enroll));
    });

  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="alert alert-danger">Ошибка загрузки курсов</div>`;
  }
}

async function enroll(courseId) {
  const token = localStorage.getItem('token');

  if (!token) {
    localStorage.setItem('redirect_after_login', location.href);
    showCoursesToast('Нужно войти, чтобы записаться.', 'warning');
    setTimeout(() => {
      location.href = 'login.html';
    }, 1200);
    return;
  }

  try {
    const res = await fetch('/api/enrollments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ course_id: courseId })
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      showCoursesToast('Запись успешна!', 'success');
    } else {
      showCoursesToast(json.error || 'Ошибка записи', 'danger');
    }
  } catch (e) {
    console.error(e);
    showCoursesToast('Ошибка сети при записи на курс', 'danger');
  }
}

document.addEventListener('DOMContentLoaded', loadCourses);