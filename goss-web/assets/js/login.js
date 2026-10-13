// Shared by login/student.html, login/staff.html and admindashboard/index.html.
// The role comes from <body data-role="...">, so each page only allows its own role.
(function () {
  const role = document.body.dataset.role;
  const label = document.body.dataset.label;
  const form = document.getElementById('login-form');
  const errBox = document.getElementById('error');
  const btn = document.getElementById('submit-btn');
  const pw = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');

  toggle.onclick = () => {
    const hidden = pw.type === 'password';
    pw.type = hidden ? 'text' : 'password';
    toggle.textContent = hidden ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const idNo = document.getElementById('id_no').value.trim();
      if (!idNo) throw new Error(label + ' is required');
      // Same ID-number -> internal login mapping used before.
      const email = `${idNo.toLowerCase()}@goss.local`;
      const { user } = await api('/api/auth.php?action=login', { method: 'POST', body: { email, password: pw.value, role } });
      location.href = '../' + user.role + '/dashboard.html';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });
})();
