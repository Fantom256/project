async function reloadCabinet() {
  const token = localStorage.getItem('token');
  if (!token) {
    location.href = 'login.html';
    return;
  }

  function translateEnrollmentStatus(status) {
    const map = {
      active: 'Активен',
      completed: 'Завершён',
      canceled: 'Отменён',
      cancelled: 'Отменён'
    };
    return map[String(status || '').toLowerCase()] || status;
  }

  function translatePaymentStatus(status) {
    const map = {
      paid: 'Оплачено',
      unpaid: 'Не оплачено',
      canceled: 'Отменено',
      cancelled: 'Отменено',
      pending: 'Ожидает оплаты'
    };
    return map[String(status || '').toLowerCase()] || status;
  }

  function getEnrollmentBadgeClass(status) {
    const value = String(status || '').toLowerCase();

    if (value === 'active') return 'text-bg-success';
    if (value === 'completed') return 'text-bg-primary';
    if (value === 'canceled' || value === 'cancelled') return 'text-bg-danger';

    return 'text-bg-secondary';
  }

  function getLessonStateBadge(state) {
    if (state === 'completed') return 'bg-success text-white';
    if (state === 'current') return 'bg-primary text-white';
    return 'bg-secondary-subtle text-dark';
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка запроса');
    }

    return data;
  }

  // имя пользователя
  const name = localStorage.getItem('full_name') || 'Пользователь';
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = name;

  const tbody = document.querySelector('#myCoursesTable tbody');
  const emptyMsg = document.getElementById('emptyMsg');

  // обычная статистика
  const statCourses = document.getElementById('statCourses');
  const statActive = document.getElementById('statActive');
  const statLast = document.getElementById('statLast');

  // геймификация
  const statLevel = document.getElementById('statLevel');
  const statXp = document.getElementById('statXp');
  const statStreak = document.getElementById('statStreak');
  const xpProgressBar = document.getElementById('xpProgressBar');
  const xpProgressText = document.getElementById('xpProgressText');
  const achievementsList = document.getElementById('achievementsList');
  const achievementCount = document.getElementById('achievementCount');
  const courseProgressList = document.getElementById('courseProgressList');

  try {
    const [enrollments, gamification] = await Promise.all([
      fetchJson('/api/enrollments/me'),
      fetchJson('/api/gamification/me')
    ]);

    tbody.innerHTML = '';
    emptyMsg.style.display = 'none';

    // ---- обычная статистика
    const total = enrollments.length;
    const active = enrollments.filter(x => (x.status || '').toLowerCase() === 'active').length;
    const last = total ? new Date(enrollments[0].enrolled_at).toLocaleString() : '—';

    if (statCourses) statCourses.textContent = total;
    if (statActive) statActive.textContent = active;
    if (statLast) statLast.textContent = last;

    // ---- геймификация
    if (statLevel) statLevel.textContent = gamification.level ?? 1;
    if (statXp) statXp.textContent = gamification.xp ?? 0;
    if (statStreak) statStreak.textContent = gamification.streak_days ?? 0;

    if (xpProgressBar && xpProgressText && gamification.level_progress) {
      const p = gamification.level_progress.percent ?? 0;
      const current = gamification.level_progress.current_xp_in_level ?? 0;
      const needed = gamification.level_progress.needed_xp_in_level ?? 100;

      xpProgressBar.style.width = `${p}%`;
      xpProgressBar.textContent = `${p}%`;
      xpProgressBar.setAttribute('aria-valuenow', String(p));
      xpProgressText.textContent = `${current} / ${needed} XP`;
    }

    // ---- достижения
    const achievements = Array.isArray(gamification.achievements) ? gamification.achievements : [];
    if (achievementCount) achievementCount.textContent = achievements.length;

    if (achievementsList) {
      if (!achievements.length) {
        achievementsList.innerHTML = `<div class="text-muted">Достижения пока не получены.</div>`;
      } else {
        achievementsList.innerHTML = achievements.map(a => `
          <div class="border rounded-3 p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${a.icon || '🏆'} ${a.title}</div>
                <div class="text-muted small">${a.description}</div>
              </div>
              <span class="badge text-bg-success">+${a.xp_reward} XP</span>
            </div>
            <div class="small text-muted mt-2">
              Получено: ${a.unlocked_at ? new Date(a.unlocked_at).toLocaleString() : '—'}
            </div>
          </div>
        `).join('');
      }
    }

    // ---- таблица курсов
    if (!total) {
      emptyMsg.style.display = 'block';
    } else {
      enrollments.forEach(row => {
        let paymentHtml = '';
        let learningHtml = '';

        if (row.payment_status === 'paid') {
          paymentHtml = `<span class="badge text-bg-success">${translatePaymentStatus(row.payment_status)}</span>`;
          learningHtml = `
            <a href="course-view.html?course_id=${row.course_id}" 
               class="btn btn-sm btn-outline-primary">
               Перейти к обучению
            </a>
          `;
        } else if (row.payment_status === 'canceled' || row.payment_status === 'cancelled') {
          paymentHtml = `<span class="badge text-bg-danger">${translatePaymentStatus(row.payment_status)}</span>`;
          learningHtml = `<span class="text-muted small">Недоступно</span>`;
        } else {
          paymentHtml = `
            <a href="payment.html?enrollment_id=${row.enrollment_id}" 
               class="btn btn-sm btn-primary">
               Оплатить
            </a>
            <div class="small text-muted mt-1">${translatePaymentStatus(row.payment_status || 'unpaid')}</div>
          `;
          learningHtml = `<span class="text-muted small">Доступ после оплаты</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="fw-semibold">${row.title}</td>
          <td>${row.category_name}</td>
          <td class="text-nowrap">${row.price} руб.</td>
          <td>
            <span class="badge ${getEnrollmentBadgeClass(row.status)}">
              ${translateEnrollmentStatus(row.status)}
            </span>
          </td>
          <td class="text-nowrap">${new Date(row.enrolled_at).toLocaleString()}</td>
          <td>${paymentHtml}</td>
          <td>${learningHtml}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // ---- прогресс по курсам
    if (courseProgressList) {
      if (!total) {
        courseProgressList.innerHTML = `<div class="text-muted">Прогресс пока недоступен.</div>`;
      } else {
        const uniqueCourseIds = [...new Set(enrollments.map(x => x.course_id))];

        const progressResponses = await Promise.all(
          uniqueCourseIds.map(async (courseId) => {
            try {
              const summary = await fetchJson(`/api/gamification/course/${courseId}`);
              const courseInfo = enrollments.find(x => x.course_id === courseId);
              return {
                ...summary,
                course_title: courseInfo?.title || `Курс #${courseId}`
              };
            } catch (e) {
              return null;
            }
          })
        );

        const progressCards = progressResponses.filter(Boolean);

        if (!progressCards.length) {
          courseProgressList.innerHTML = `<div class="text-muted">Прогресс пока недоступен.</div>`;
        } else {
          courseProgressList.innerHTML = progressCards.map(course => `
            <div class="border rounded-3 p-3">
              <div class="d-flex justify-content-between align-items-center mb-2 gap-2">
                <div class="fw-semibold">${course.course_title}</div>
                <div class="small text-muted">${course.completed_lessons} / ${course.total_lessons} уроков</div>
              </div>

              <div class="progress mb-3" style="height: 12px;">
                <div class="progress-bar" role="progressbar" style="width: ${course.progress_percent}%;">
                  ${course.progress_percent}%
                </div>
              </div>

              <div class="d-flex flex-wrap gap-2">
                ${course.progress_map.map(lesson => `
                  <span
                    class="badge ${getLessonStateBadge(lesson.state)}"
                    title="${lesson.title}"
                  >
                    ${lesson.lesson_order}
                  </span>
                `).join('')}
              </div>
            </div>
          `).join('');
        }
      }
    }

  } catch (e) {
    console.error(e);
    alert(e.message || 'Ошибка сети');
  }
}

document.addEventListener('DOMContentLoaded', reloadCabinet);
window.reloadCabinet = reloadCabinet;

