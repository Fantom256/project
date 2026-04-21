function applyTheme(theme) {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggleBtn');

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    if (btn) btn.textContent = '☀ Светлая';
  } else {
    root.removeAttribute('data-theme');
    if (btn) btn.textContent = '🌙 Тёмная';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('site_theme');

  if (savedTheme === 'dark') {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }

  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const nextTheme = isDark ? 'light' : 'dark';
      localStorage.setItem('site_theme', nextTheme);
      applyTheme(nextTheme);
    });
  }
}

document.addEventListener('DOMContentLoaded', initTheme);