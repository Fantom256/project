document.addEventListener('DOMContentLoaded', () => {
  const navUl = document.getElementById('nav-ul');
  if (!navUl) return;

  const userId = localStorage.getItem('user_id');
  const role = localStorage.getItem('role'); // admin | manager | student | support
  const name = localStorage.getItem('full_name');

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  function isActive(href) {
    return currentPage === href ? 'active' : '';
  }

  let links = `
    <li class="nav-item"><a class="nav-link ${isActive('index.html')}" href="index.html">Главная</a></li>
    <li class="nav-item"><a class="nav-link ${isActive('courses.html')}" href="courses.html">Курсы</a></li>
    <li class="nav-item"><a class="nav-link ${isActive('about.html')}" href="about.html">О нас</a></li>
    <li class="nav-item"><a class="nav-link ${isActive('reviews.html')}" href="reviews.html">Отзывы</a></li>
  `;

  if (userId) {
    if (role === 'admin') {
      links += `
        <li class="nav-item">
          <a class="nav-link ${isActive('admin.html')}" href="admin.html">Админ-панель</a>
        </li>
      `;
    } else if (role === 'manager') {
      links += `
        <li class="nav-item">
          <a class="nav-link ${isActive('manager.html')}" href="manager.html">Кабинет менеджера</a>
        </li>
      `;
    } else if (role === 'support') {
      links += `
        <li class="nav-item">
          <a class="nav-link ${isActive('support.html')}" href="support.html">Центр поддержки</a>
        </li>
      `;
    } else {
      links += `
        <li class="nav-item">
          <a class="nav-link ${isActive('cabinet.html')}" href="cabinet.html">Личный кабинет</a>
        </li>
      `;
    }

    links += `
      <li class="nav-item"><span class="cs-nav-user">${name || 'Пользователь'}</span></li>
      <li class="nav-item"><a class="nav-link logout-link" href="#" id="logoutLink">Выход</a></li>
    `;
  } else {
    links += `
      <li class="nav-item"><a class="nav-link ${isActive('login.html')}" href="login.html">Вход</a></li>
      <li class="nav-item"><a class="nav-link ${isActive('register.html')}" href="register.html">Регистрация</a></li>
    `;
  }

  navUl.innerHTML = links;

  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.clear();
      location.href = 'index.html';
    });
  }
});