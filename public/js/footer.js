document.addEventListener('DOMContentLoaded', async () => {
  const holder = document.getElementById('footer-holder');
  if (!holder) return;

  try {
    const res = await fetch('/partials/footer.html');
    holder.innerHTML = await res.text();
  } catch (e) {
    console.error('Footer load error:', e);
  }
});
