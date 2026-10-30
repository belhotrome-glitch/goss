// Builds the sidebar/topbar shell for authenticated pages.
// Since pages now live in per-role folders (student/, staff/, admin/,
// shared/), all nav hrefs below are resolved relative to the CURRENT page's
// folder using window.ROOT_PATH (set inline on every page, '' for the root
// the login page or '../' for anything one level deep).
const RP = window.ROOT_PATH || '';

const STUDENT_NAV = [
  { href: RP + 'student/dashboard.html', icon: '🏠', label: 'Dashboard', key: 'dashboard' },
  { href: RP + 'student/concerns.html', icon: '💬', label: 'My Concerns', key: 'concerns' },
  { href: RP + 'student/submit.html', icon: '📝', label: 'Submit Concern', key: 'submit' },
  { href: RP + 'student/appointments.html', icon: '📅', label: 'Appointments', key: 'appointments' },
  { href: RP + 'shared/notifications.html', icon: '🔔', label: 'Notifications', key: 'notifications' },
  { href: RP + 'shared/guidance-resources.html', icon: '📚', label: 'Guidance Resources', key: 'resources' },
];

const STAFF_NAV = [
  { href: RP + 'staff/dashboard.html', icon: '🏠', label: 'Dashboard', key: 'dashboard' },
  { href: RP + 'staff/concerns.html', icon: '💬', label: 'All Concerns', key: 'concerns' },
  { href: RP + 'staff/appointments.html', icon: '📅', label: 'Appointments', key: 'appointments' },
  { href: RP + 'staff/announcements.html', icon: '📣', label: 'Announcements', key: 'announcements' },
  { href: RP + 'staff/reports.html', icon: '📊', label: 'Reports', key: 'reports' },
  { href: RP + 'shared/notifications.html', icon: '🔔', label: 'Notifications', key: 'notifications' },
  { href: RP + 'staff/profile.html', icon: '👤', label: 'Profile', key: 'profile' },
];

const ADMIN_NAV = [
  { href: RP + 'admin/dashboard.html', icon: '🏠', label: 'Overview', key: 'dashboard' },
  { href: RP + 'admin/users.html', icon: '👥', label: 'Users', key: 'users' },
  { href: RP + 'admin/concerns.html', icon: '💬', label: 'Concerns', key: 'concerns' },
  { href: RP + 'admin/appointments.html', icon: '📅', label: 'Appointments', key: 'appointments' },
  { href: RP + 'admin/reports.html', icon: '📊', label: 'Reports', key: 'reports' },
  { href: RP + 'admin/audit-logs.html', icon: '🛡️', label: 'Audit Logs', key: 'audit' },
];

function renderShell(user, activeKey, pageTitle) {
  const nav = user.role === 'admin' ? ADMIN_NAV : (user.role === 'staff' ? STAFF_NAV : STUDENT_NAV);
  const roleLabel = user.role === 'admin'
    ? 'Administrator'
    : user.role === 'staff'
      ? user.position || 'Staff'
      : 'Student';
  const navHtml = nav.map(item => `
    <a class="nav-item ${item.key === activeKey ? 'active' : ''}" href="${item.href}">
      <span class="nav-icon">${item.icon}</span>${item.label}
    </a>`).join('');
  const topbarLogout = `
          <a class="icon-btn topbar-logout" href="#" onclick="logout();return false;" aria-label="Log Out" title="Log Out">
            <span aria-hidden="true">🚪</span><span>Log Out</span>
          </a>`;

  document.getElementById('shell').innerHTML = `
    <aside class="sidebar" id="app-sidebar">
      <div class="brand user-brand">
        <div class="brand-logo"><img src="${RP}assets/img/logo.png" alt="Tangub City Global College logo"></div>
        <div class="brand-copy">
          <h1>GOSS</h1>
          <div class="brand-user">
            <div class="name">${esc(user.full_name)}</div>
            <div class="role">${esc(roleLabel)}</div>
          </div>
        </div>
      </div>
      ${navHtml}
      <div class="nav-spacer"></div>
    </aside>
    <button class="sidebar-backdrop hidden" type="button" aria-label="Close navigation menu" tabindex="-1" onclick="toggleSidebar(false)"></button>
    <div class="main">
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="icon-btn mobile-toggle" type="button" onclick="toggleSidebar()" aria-label="Open navigation menu" aria-controls="app-sidebar" aria-expanded="false">☰</button>
          <h2>${pageTitle}</h2>
        </div>
        <div class="topbar-actions">
          <a class="icon-btn" href="${RP}shared/notifications.html" style="text-decoration:none">
            🔔
            <span id="notif-badge" class="badge-dot hidden"></span>
          </a>
          ${topbarLogout}
        </div>
      </div>
      <div class="content" id="page-content"></div>
    </div>
  `;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') toggleSidebar(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 800) toggleSidebar(false);
  });
  document.querySelectorAll('#app-sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 800) toggleSidebar(false);
    });
  });
  refreshNotifBadge();
}
