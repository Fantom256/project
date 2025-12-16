document.addEventListener('DOMContentLoaded', () => {
  const navUl = document.getElementById('nav-ul');
  const navLinks = document.getElementById('nav-links');
  const burger = document.getElementById('burger-menu');
  if (!navUl) return;

  const userId = localStorage.getItem('user_id');
  const role   = localStorage.getItem('role');        // admin|student
  const name   = localStorage.getItem('full_name');

  let links = `
    <li class="nav-item"><a class="nav-link" href="index.html">Главная</a></li>
    <li class="nav-item"><a class="nav-link" href="courses.html">Курсы</a></li>
    <li class="nav-item"><a class="nav-link" href="about.html">О нас</a></li>
    <li class="nav-item"><a class="nav-link" href="reviews.html">Отзывы</a></li>
  `;

  if (userId) {
    if (role === 'admin') links += `<li class="nav-item"><a class="nav-link" href="admin.html">Админ-панель</a></li>`;
    else links += `<li class="nav-item"><a class="nav-link" href="cabinet.html">Личный кабинет</a></li>`;

    links += `
      <li class="nav-item"><span class="nav-link disabled">${name || 'Пользователь'}</span></li>
      <li class="nav-item"><a class="nav-link text-danger" href="#" id="logoutLink">Выход</a></li>
    `;
  } else {
    links += `
      <li class="nav-item"><a class="nav-link" href="login.html">Вход</a></li>
      <li class="nav-item"><a class="nav-link" href="register.html">Регистрация</a></li>
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

  if (burger && navLinks) {
    burger.addEventListener('click', () => navLinks.classList.toggle('show'));
  }
});
