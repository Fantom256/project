async function reloadCabinet() {
  const token = localStorage.getItem('token');
  if (!token) {
    location.href = 'login.html';
    return;
  }

  // имя пользователя
  const name = localStorage.getItem('full_name') || 'Пользователь';
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = name;

  const tbody = document.querySelector('#myCoursesTable tbody');
  const emptyMsg = document.getElementById('emptyMsg');

  // stat elements
  const statCourses = document.getElementById('statCourses');
  const statActive = document.getElementById('statActive');
  const statLast = document.getElementById('statLast');

  try {
    const res = await fetch('/api/enrollments/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Ошибка загрузки кабинета');
      return;
    }

    tbody.innerHTML = '';
    emptyMsg.style.display = 'none';

    // ---- статистика
    const total = data.length;
    const active = data.filter(x => (x.status || '').toLowerCase() === 'active').length;
    const last = total ? new Date(data[0].enrolled_at).toLocaleString() : '—';

    if (statCourses) statCourses.textContent = total;
    if (statActive) statActive.textContent = active;
    if (statLast) statLast.textContent = last;

    // ---- таблица
    if (!total) {
      emptyMsg.style.display = 'block';
      return;
    }

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold">${row.title}</td>
        <td>${row.category_name}</td>
        <td class="text-nowrap">${row.price} руб.</td>
        <td>
          <span class="badge ${row.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}">
            ${row.status}
          </span>
        </td>
        <td class="text-nowrap">${new Date(row.enrolled_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (e) {
    console.error(e);
    alert('Ошибка сети');
  }
}

document.addEventListener('DOMContentLoaded', reloadCabinet);
window.reloadCabinet = reloadCabinet;

