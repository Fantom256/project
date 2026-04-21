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
    if (state === 'completed') return 'done';
    if (state === 'current') return 'current';
    return '';
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token }
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.clear();
      location.href = 'login.html';
      throw new Error('Сессия истекла. Войдите заново.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка запроса');
    }

    return data;
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString();
  }

  function formatPrice(value) {
    const num = Number(value || 0);
    return `${num.toFixed(2)} руб.`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  const name = localStorage.getItem('full_name') || 'Пользователь';
  setText('userName', name);

  const emptyMsg = document.getElementById('emptyMsg');
  const coursesList = document.getElementById('myCoursesList');
  const continueLearningCard = document.getElementById('continueLearningCard');
  const achievementsList = document.getElementById('achievementsList');
  const courseProgressList = document.getElementById('courseProgressList');

  try {
    const [enrollments, gamification] = await Promise.all([
      fetchJson('/api/enrollments/me'),
      fetchJson('/api/gamification/me')
    ]);

    const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
    const achievements = Array.isArray(gamification?.achievements) ? gamification.achievements : [];

    if (coursesList) coursesList.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'none';

    const total = safeEnrollments.length;
    const active = safeEnrollments.filter(
      x => String(x.status || '').toLowerCase() === 'active'
    ).length;
    const last = total ? formatDate(safeEnrollments[0].enrolled_at) : '—';

    // обычная статистика
    setText('statCourses', total);
    setText('statActive', active);
    setText('statLast', last);

    // геймификация
    const level = gamification?.level ?? 1;
    const xp = gamification?.xp ?? 0;
    const streak = gamification?.streak_days ?? 0;

    setText('heroLevel', level);
    setText('heroXp', xp);
    setText('heroStreak', streak);

    setText('statLevel', level);
    setText('statXp', xp);
    setText('statStreak', streak);

    if (gamification?.level_progress) {
      const p = gamification.level_progress.percent ?? 0;
      const current = gamification.level_progress.current_xp_in_level ?? 0;
      const needed = gamification.level_progress.needed_xp_in_level ?? 100;

      const xpProgressBar = document.getElementById('xpProgressBar');
      if (xpProgressBar) {
        xpProgressBar.style.width = `${p}%`;
        xpProgressBar.textContent = `${p}%`;
        xpProgressBar.setAttribute('aria-valuenow', String(p));
      }

      setText('xpTextRight', `${current} / ${needed} XP`);
      setText('xpHintText', `До следующего уровня осталось ${Math.max(0, needed - current)} XP`);
    }

    // достижения
    setText('achievementsCount', achievements.length);

    if (achievementsList) {
      if (!achievements.length) {
        achievementsList.innerHTML = `<div class="text-muted">Достижения пока не получены.</div>`;
      } else {
        achievementsList.innerHTML = achievements.map(a => `
          <div class="cabinet-achievement-item">
            <div class="cabinet-achievement-icon">${a.icon || '🏆'}</div>
            <div class="cabinet-achievement-content">
              <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <div>
                  <div class="cabinet-achievement-title">${a.title}</div>
                  <div class="cabinet-achievement-desc">${a.description || ''}</div>
                </div>
                <span class="cabinet-achievement-xp">+${a.xp_reward || 0} XP</span>
              </div>
              <div class="cabinet-achievement-date">
                Получено: ${a.unlocked_at ? new Date(a.unlocked_at).toLocaleString() : '—'}
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    // карточки курсов
    if (!total) {
      if (emptyMsg) emptyMsg.style.display = 'block';
      if (coursesList) coursesList.innerHTML = '';
    } else if (coursesList) {
      coursesList.innerHTML = '';

      safeEnrollments.forEach(row => {
        let paymentHtml = '';
        let learningHtml = '';

        if (row.payment_status === 'paid') {
          paymentHtml = `<span class="badge text-bg-success rounded-pill">${translatePaymentStatus(row.payment_status)}</span>`;
          learningHtml = `
            <a href="course-view.html?course_id=${row.course_id}" 
               class="btn btn-primary btn-sm">
               Перейти к обучению
            </a>
          `;
        } else if (row.payment_status === 'canceled' || row.payment_status === 'cancelled') {
          paymentHtml = `<span class="badge text-bg-danger rounded-pill">${translatePaymentStatus(row.payment_status)}</span>`;
          learningHtml = `<span class="text-muted small">Недоступно</span>`;
        } else {
          paymentHtml = `
            <a href="payment.html?enrollment_id=${row.enrollment_id}" 
               class="btn btn-outline-primary btn-sm">
               Оплатить
            </a>
          `;
          learningHtml = `<span class="text-muted small">Доступ после оплаты</span>`;
        }

        const card = document.createElement('div');
        card.className = 'cabinet-course-card';

        card.innerHTML = `
          <div class="cabinet-course-card-top">
            <div>
              <div class="cabinet-course-title">${row.title}</div>
              <div class="cabinet-course-category">${row.category_name || 'Без категории'}</div>
            </div>

            <div class="cabinet-course-price">${formatPrice(row.price)}</div>
          </div>

          <div class="cabinet-course-meta">
            <div class="cabinet-course-meta-item">
              <span class="cabinet-course-meta-label">Статус</span>
              <span class="badge rounded-pill ${getEnrollmentBadgeClass(row.status)}">
                ${translateEnrollmentStatus(row.status)}
              </span>
            </div>

            <div class="cabinet-course-meta-item">
              <span class="cabinet-course-meta-label">Дата записи</span>
              <span>${formatDate(row.enrolled_at)}</span>
            </div>

            <div class="cabinet-course-meta-item">
              <span class="cabinet-course-meta-label">Оплата</span>
              <span>${paymentHtml}</span>
            </div>
          </div>

          <div class="cabinet-course-card-bottom">
            <div class="cabinet-course-actions">
              ${learningHtml}
            </div>
          </div>
        `;

        coursesList.appendChild(card);
      });
    }

    // прогресс по курсам
    if (courseProgressList) {
      if (!total) {
        courseProgressList.innerHTML = `<div class="text-muted">Прогресс пока недоступен.</div>`;
        if (continueLearningCard) continueLearningCard.style.display = 'none';
      } else {
        const uniqueCourseIds = [...new Set(safeEnrollments.map(x => x.course_id))];

        const progressResponses = await Promise.all(
          uniqueCourseIds.map(async (courseId) => {
            try {
              const summary = await fetchJson(`/api/gamification/course/${courseId}`);
              const courseInfo = safeEnrollments.find(x => x.course_id === courseId);
              return {
                ...summary,
                course_title: courseInfo?.title || `Курс #${courseId}`,
                payment_status: courseInfo?.payment_status || null,
                course_id: courseId
              };
            } catch (e) {
              return null;
            }
          })
        );

        const progressCards = progressResponses.filter(Boolean);

        if (!progressCards.length) {
          courseProgressList.innerHTML = `<div class="text-muted">Прогресс пока недоступен.</div>`;
          if (continueLearningCard) continueLearningCard.style.display = 'none';
        } else {
          courseProgressList.innerHTML = progressCards.map(course => `
            <div class="cabinet-course-progress-item">
              <div class="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
                <div class="fw-semibold">${course.course_title}</div>
                <div class="small text-muted">${course.completed_lessons} / ${course.total_lessons} уроков</div>
              </div>

              <div class="progress cabinet-progress mb-3">
                <div class="progress-bar" role="progressbar" style="width: ${course.progress_percent}%;">
                  ${course.progress_percent}%
                </div>
              </div>

              <div class="cabinet-lesson-dots">
                ${Array.isArray(course.progress_map) ? course.progress_map.map(lesson => `
                  <span
                    class="cabinet-lesson-dot ${getLessonStateBadge(lesson.state)}"
                    title="${lesson.title}"
                  >
                    ${lesson.lesson_order}
                  </span>
                `).join('') : ''}
              </div>
            </div>
          `).join('');

          const continueCourse = progressCards.find(course =>
            course.payment_status === 'paid' && Number(course.progress_percent) < 100
          ) || progressCards.find(course => course.payment_status === 'paid');

          if (continueCourse && continueLearningCard) {
            continueLearningCard.style.display = 'block';

            setText('continueCourseTitle', continueCourse.course_title);
            setText(
              'continueCourseText',
              continueCourse.progress_percent >= 100
                ? 'Курс завершён. Можно повторить материалы.'
                : 'Продолжай обучение с последнего доступного урока.'
            );
            setText(
              'continueLessonsMeta',
              `${continueCourse.completed_lessons} / ${continueCourse.total_lessons} уроков`
            );
            setText('continuePercentMeta', `${continueCourse.progress_percent}%`);

            const continueProgressBar = document.getElementById('continueProgressBar');
            if (continueProgressBar) {
              continueProgressBar.style.width = `${continueCourse.progress_percent}%`;
              continueProgressBar.textContent = `${continueCourse.progress_percent}%`;
            }

            const continueBtn = document.getElementById('continueBtn');
            if (continueBtn) {
              continueBtn.href = `course-view.html?course_id=${continueCourse.course_id}`;
            }
          } else if (continueLearningCard) {
            continueLearningCard.style.display = 'none';
          }
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