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

      data[catName].forEach(c => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6';

        col.innerHTML = `
          <div class="card h-100 cs-card p-3">
            ${c.image_url ? `<img src="${c.image_url}" class="img-fluid rounded-3 mb-3" alt="${c.title}">` : ''}
            <h5 class="mb-2">${c.title}</h5>
            <p class="text-muted mb-2">${c.description}</p>
            <div class="d-flex justify-content-between align-items-center">
              <div><b>${c.price}</b> руб.</div>
              <button class="btn btn-primary btn-sm" data-enroll="${c.course_id}">Записаться</button>
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

// пока auth можно подключить позже — но “крючок” уже есть
async function enroll(courseId) {
  const userId = localStorage.getItem('user_id');
  if (!userId) {
    alert('Нужно войти, чтобы записаться.');
    location.href = 'login.html';
    return;
  }

  const res = await fetch('/api/enroll', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ user_id: Number(userId), course_id: courseId })
  });

  const json = await res.json();
  if (res.ok && json.success) alert('Вы записались! № ' + json.consultation_id);
  else alert(json.error || 'Ошибка записи');
}

document.addEventListener('DOMContentLoaded', loadCourses);
