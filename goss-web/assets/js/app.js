// ============================================================================
// GOSS — Supabase (Auth + Postgres) data layer
// This file replaces the old Firebase version. Every page in the app still
// calls the same api('/api/xxx.php?action=yyy', {...}) function — it's just
// backed by Supabase now (see supabase/schema.sql for the tables + RLS
// policies). Response shapes match the original endpoints, so no other file
// needed to change.
// ============================================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- small utils ----
function pad(n) { return String(n).padStart(2, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function check(res) {
  if (res.error) throw new Error(res.error.message || 'Database error');
  return res.data;
}

// ---- audit logging (best-effort; never blocks the calling action) ----
async function auditLog(action, targetType, targetId, metadata) {
  try {
    const { data: { user: authUser } } = await sb.auth.getUser();
    await sb.from('audit_logs').insert({
      user_id: authUser ? authUser.id : null,
      action, target_type: targetType || null, target_id: targetId || null,
      metadata: metadata || null, created_at: nowStr(),
    });
  } catch { /* logging must never break the user-facing action */ }
}

function friendlyAuthError(e, fallback) {
  const msg = (e && e.message) || '';
  const map = {
    'Invalid login credentials': 'Invalid ID number or password',
    'User already registered': 'An account with this ID already exists',
    'Password should be at least 6 characters': 'Password is too weak (min 6 characters)',
  };
  return map[msg] || fallback || msg || 'Something went wrong';
}

// ---- auth state ----
async function getCurrentUserDoc() {
  const { data: { user: authUser } } = await sb.auth.getUser();
  if (!authUser) return null;
  const { data, error } = await sb.from('users').select('*').eq('id', authUser.id).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function requireLogin() {
  const user = await getCurrentUserDoc();
  if (!user) throw new Error('Not authenticated');
  return user;
}

// cache of all users for the current page load (avoids refetching per row)
let _usersMapCache = null;
async function fetchAllUsersMap(force = false) {
  if (_usersMapCache && !force) return _usersMapCache;
  const rows = check(await sb.from('users').select('*'));
  const map = {};
  rows.forEach((u) => { map[u.id] = u; });
  _usersMapCache = map;
  return map;
}

// ---- path parsing so existing api('/api/x.php?action=y') calls still work ----
function parseApiPath(path) {
  const [base, qs] = path.split('?');
  const endpoint = base.split('/').pop().replace('.php', '');
  const params = new URLSearchParams(qs || '');
  return { endpoint, params };
}

async function api(path, { method = 'GET', body = null } = {}) {
  const { endpoint, params } = parseApiPath(path);
  const action = params.get('action') || 'list';
  switch (endpoint) {
    case 'auth': return handleAuth(action, body || {});
    case 'concerns': return handleConcerns(action, params, body || {});
    case 'appointments': return handleAppointments(action, params, body || {});
    case 'dashboard': return handleDashboard(action);
    case 'notifications': return handleNotifications(action, body || {});
    case 'profile': return handleProfile(action, body || {});
    case 'admin': return handleAdmin(action, params, body || {});
    case 'announcements': return handleAnnouncements(action, body || {});
    case 'feedback': return handleFeedback(action, params, body || {});
    default: throw new Error('Unknown endpoint');
  }
}

// ---- auth.php ----
async function handleAuth(action, body) {
  if (action === 'login') {
    const email = (body.email || '').trim();
    const password = body.password || '';
    const role = body.role || null;
    if (!email || !password) throw new Error('Email and password are required');

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error, 'Invalid ID number or password'));

    const { data: userRow, error: uErr } = await sb.from('users').select('*').eq('id', data.user.id).maybeSingle();
    if (uErr || !userRow) { await sb.auth.signOut(); throw new Error('Invalid ID number or password'); }
    if (role && userRow.role !== role) {
      await sb.auth.signOut();
      throw new Error(`This is the ${role} login. Please use the ${userRow.role} login page instead.`);
    }
    if (userRow.is_active === false) {
      await sb.auth.signOut();
      throw new Error('This account has been deactivated. Contact the guidance office.');
    }
    await auditLog('login', 'user', userRow.id, null);
    return { user: userRow };
  }

  if (action === 'logout') {
    await sb.auth.signOut();
    _usersMapCache = null;
    return { ok: true };
  }

  if (action === 'me') {
    const user = await getCurrentUserDoc();
    return { user };
  }

  throw new Error('Unknown action');
}

// ---- concerns.php ----
async function handleConcerns(action, params, body) {
  const user = await requireLogin();
  const usersMap = await fetchAllUsersMap();

  if (action === 'list') {
    let q = sb.from('concerns').select('*');
    if (user.role === 'student') {
      q = q.eq('student_id', user.id);
    } else {
      const status = params.get('status');
      const category = params.get('category');
      if (status) q = q.eq('status', status);
      if (category) q = q.eq('category', category);
    }
    let rows = check(await q);

    if (user.role === 'student') {
      rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else {
      rows.sort((a, b) => {
        if (!!b.is_urgent !== !!a.is_urgent) return (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
    }

    rows = rows.map((r) => {
      const staff = r.assigned_to ? usersMap[r.assigned_to] : null;
      const out = { ...r, staff_name: staff ? staff.full_name : null };
      if (user.role === 'staff') {
        const student = usersMap[r.student_id];
        out.student_name = student ? student.full_name : null;
        out.student_no = student ? student.user_id_no : null;
        out.student_course = student ? student.course : null;
      }
      return out;
    });
    return { concerns: rows };
  }

  if (action === 'detail') {
    const id = params.get('id');
    const c = check(await sb.from('concerns').select('*').eq('id', id).maybeSingle());
    if (!c) throw new Error('Not found');
    if (user.role === 'student' && c.student_id !== user.id) throw new Error('Forbidden');

    const student = usersMap[c.student_id];
    const staff = c.assigned_to ? usersMap[c.assigned_to] : null;
    c.student_name = student ? student.full_name : null;
    c.student_no = student ? student.user_id_no : null;
    c.student_course = student ? student.course : null;
    c.staff_name = staff ? staff.full_name : null;

    const msgRows = check(await sb.from('messages').select('*').eq('concern_id', id).order('sent_at', { ascending: true }));
    const messages = msgRows.map((m) => {
      const sender = usersMap[m.sender_id];
      return {
        ...m,
        sender_name: sender ? sender.full_name : null,
        sender_role: sender ? sender.role : null,
      };
    });

    return { concern: c, messages };
  }

  if (action === 'create') {
    const category = (body.category || '').trim();
    const subject = (body.subject || '').trim();
    const description = (body.description || '').trim();
    const isUrgent = !!body.is_urgent;
    if (!category || !subject || !description) throw new Error('Category, subject and description are required');

    const ts = nowStr();
    const concern = check(await sb.from('concerns').insert({
      student_id: user.id, category, subject, description,
      is_anonymous: false, is_urgent: isUrgent,
      status: 'Pending', assigned_to: null,
      created_at: ts, updated_at: ts,
    }).select().single());

    await sb.from('messages').insert({ concern_id: concern.id, sender_id: user.id, message: description, sent_at: ts });

    const staffUsers = Object.values(usersMap).filter((u) => u.role === 'staff');
    if (staffUsers.length) {
      await sb.from('notifications').insert(staffUsers.map((s) => ({
        user_id: s.id, title: 'New Concern Submitted',
        body: `A new concern "${subject}" has been submitted.`,
        is_read: false, created_at: ts,
      })));
    }

    await auditLog('concern_created', 'concern', concern.id, { category, is_urgent: isUrgent });
    return { id: concern.id };
  }

  if (action === 'reply') {
    const id = body.concern_id;
    const message = (body.message || '').trim();
    if (!message) throw new Error('Message cannot be empty');

    const c = check(await sb.from('concerns').select('*').eq('id', id).maybeSingle());
    if (!c) throw new Error('Not found');
    if (user.role === 'student' && c.student_id !== user.id) throw new Error('Forbidden');

    const ts = nowStr();
    await sb.from('messages').insert({ concern_id: id, sender_id: user.id, message, sent_at: ts });
    await sb.from('concerns').update({ updated_at: ts }).eq('id', id);

    const notifyUser = user.role === 'student' ? c.assigned_to : c.student_id;
    if (notifyUser) {
      await sb.from('notifications').insert({
        user_id: notifyUser, title: 'Concern Update',
        body: `${user.full_name} replied to concern: ${c.subject}`,
        is_read: false, created_at: ts,
      });
    }
    return { ok: true };
  }

  if (action === 'update') {
    if (user.role !== 'staff') throw new Error('Forbidden');
    const id = body.id;
    const c = check(await sb.from('concerns').select('*').eq('id', id).maybeSingle());
    if (!c) throw new Error('Not found');

    const updates = { updated_at: nowStr() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.assign_to_me) updates.assigned_to = user.id;
    if (Object.keys(updates).length <= 1) throw new Error('Nothing to update');
    if (updates.status === 'Resolved' && !c.resolved_at) updates.resolved_at = nowStr();
    await sb.from('concerns').update(updates).eq('id', id);
    await auditLog('concern_updated', 'concern', id, updates);

    await sb.from('notifications').insert({
      user_id: c.student_id, title: 'Concern Update',
      body: `Your concern "${c.subject}" was updated.`,
      is_read: false, created_at: nowStr(), event_type: 'concern_status_changed',
    });
    return { ok: true };
  }

  throw new Error('Unknown action');
}

// ---- appointments.php ----
async function handleAppointments(action, params, body) {
  const user = await requireLogin();
  const usersMap = await fetchAllUsersMap();

  if (action === 'list') {
    let rows;
    if (user.role === 'student') {
      rows = check(await sb.from('appointments').select('*').eq('student_id', user.id)).map((a) => ({
        ...a,
        staff_name: usersMap[a.staff_id] ? usersMap[a.staff_id].full_name : null,
        staff_position: usersMap[a.staff_id] ? usersMap[a.staff_id].position : null,
      }));
    } else {
      rows = check(await sb.from('appointments').select('*').eq('staff_id', user.id)).map((a) => ({
        ...a,
        student_name: usersMap[a.student_id] ? usersMap[a.student_id].full_name : null,
        student_no: usersMap[a.student_id] ? usersMap[a.student_id].user_id_no : null,
        student_course: usersMap[a.student_id] ? usersMap[a.student_id].course : null,
      }));
    }
    rows.sort((a, b) => (a.appt_date === b.appt_date
      ? (a.appt_time || '').localeCompare(b.appt_time || '')
      : a.appt_date.localeCompare(b.appt_date)));
    return { appointments: rows };
  }

  if (action === 'staff_list') {
    const staff = Object.values(usersMap)
      .filter((u) => u.role === 'staff')
      .map((u) => ({ id: u.id, full_name: u.full_name, position: u.position }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    return { staff };
  }

  if (action === 'student_list') {
    if (user.role !== 'staff' && user.role !== 'admin') throw new Error('Forbidden');
    const students = Object.values(usersMap)
      .filter((u) => u.role === 'student')
      .map((u) => ({ id: u.id, full_name: u.full_name, user_id_no: u.user_id_no, course: u.course }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    return { students };
  }

  if (action === 'create') {
    const date = body.appt_date;
    const time = (body.appt_time || '').trim();
    const type = body.type || 'In-Person';
    const notes = (body.notes || '').trim();
    const location = type === 'Virtual' ? 'Virtual' : ((body.location || '').trim() || 'Guidance Office');
    if (!date || !time) throw new Error('Date and time are required');

    let studentId, staffId, status, notifyUserId, notifyTitle, notifyBody;
    const ts = nowStr();

    if (user.role === 'student') {
      staffId = body.staff_id;
      if (!staffId) throw new Error('Staff is required');
      studentId = user.id;
      status = 'Pending';
      notifyUserId = staffId;
      notifyTitle = 'New Appointment Request';
      notifyBody = `${user.full_name} requested an appointment on ${date} at ${time}. Please accept or reschedule.`;
    } else if (user.role === 'staff') {
      studentId = body.student_id;
      if (!studentId) throw new Error('Student is required');
      staffId = user.id;
      status = 'Scheduled';
      notifyUserId = studentId;
      notifyTitle = 'Appointment Scheduled';
      notifyBody = `${user.full_name} scheduled an appointment for you on ${date} at ${time}.`;
    } else {
      throw new Error('Only students and staff can book appointments');
    }

    const { data: apptData, error: apptErr } = await sb.from('appointments').insert({
      student_id: studentId, staff_id: staffId, appt_date: date, appt_time: time,
      type, notes: notes || null, location, status, created_at: ts,
    }).select().single();
    if (apptErr) {
      if (apptErr.code === '23505') throw new Error('That counselor already has an appointment at that date/time. Pick another slot.');
      throw new Error(apptErr.message || 'Could not book appointment');
    }
    const appt = apptData;

    await sb.from('notifications').insert({
      user_id: notifyUserId, title: notifyTitle, body: notifyBody,
      is_read: false, created_at: ts, event_type: 'appointment_created',
    });
    await auditLog('appointment_created', 'appointment', appt.id, { appt_date: date, appt_time: time, status });
    return { id: appt.id };
  }

  if (action === 'update_status') {
    const id = body.id;
    const status = body.status;
    if (!['Pending', 'Scheduled', 'Completed', 'Cancelled'].includes(status)) throw new Error('Invalid status');

    const a = check(await sb.from('appointments').select('*').eq('id', id).maybeSingle());
    if (!a) throw new Error('Not found');
    if (user.role === 'student' && a.student_id !== user.id) throw new Error('Forbidden');
    if (user.role === 'staff' && a.staff_id !== user.id) throw new Error('Forbidden');
    // Only staff (or admin) can accept a pending request or mark it completed/no-show.
    if (user.role === 'student' && status !== 'Cancelled') throw new Error('Students can only cancel an appointment');

    await sb.from('appointments').update({ status }).eq('id', id);
    await auditLog('appointment_status_changed', 'appointment', id, { status });
    const notifyUser = user.role === 'student' ? a.staff_id : a.student_id;
    const verb = status === 'Scheduled' ? 'accepted and confirmed' : `now ${status}`;
    await sb.from('notifications').insert({
      user_id: notifyUser, title: 'Appointment Update',
      body: `Appointment on ${a.appt_date} at ${a.appt_time} is ${verb}.`,
      is_read: false, created_at: nowStr(), event_type: 'appointment_status_changed',
    });
    return { ok: true };
  }

  // Staff accepts a pending request as-is, or proposes a new date/time.
  // Either way the appointment ends up 'Scheduled' and the student is notified.
  if (action === 'reschedule') {
    if (user.role !== 'staff' && user.role !== 'admin') throw new Error('Only staff can accept or reschedule appointments');
    const id = body.id;
    const date = body.appt_date;
    const time = (body.appt_time || '').trim();
    if (!date || !time) throw new Error('Date and time are required');

    const a = check(await sb.from('appointments').select('*').eq('id', id).maybeSingle());
    if (!a) throw new Error('Not found');
    if (user.role === 'staff' && a.staff_id !== user.id) throw new Error('Forbidden');
    if (!['Pending', 'Scheduled'].includes(a.status)) throw new Error('This appointment can no longer be changed');

    const changed = date !== a.appt_date || time !== a.appt_time;
    const { error: updErr } = await sb.from('appointments')
      .update({ appt_date: date, appt_time: time, status: 'Scheduled' })
      .eq('id', id);
    if (updErr) {
      if (updErr.code === '23505') throw new Error('You already have another appointment at that date/time. Pick another slot.');
      throw new Error(updErr.message || 'Could not update appointment');
    }
    await auditLog('appointment_rescheduled', 'appointment', id, { appt_date: date, appt_time: time, changed });
    await sb.from('notifications').insert({
      user_id: a.student_id,
      title: changed ? 'Appointment Rescheduled' : 'Appointment Confirmed',
      body: changed
        ? `Your appointment was moved to ${date} at ${time} and is now confirmed.`
        : `Your appointment on ${date} at ${time} has been confirmed.`,
      is_read: false, created_at: nowStr(), event_type: 'appointment_status_changed',
    });
    return { ok: true };
  }

  throw new Error('Unknown action');
}

// ---- admin.php (v2) ----
async function handleAdmin(action, params, body) {
  const user = await requireLogin();
  if (user.role !== 'admin') throw new Error('Forbidden');

  if (action === 'overview') {
    const [users, concerns, appts, notifs] = await Promise.all([
      sb.from('users').select('id, role, is_active, full_name'),
      sb.from('concerns').select('id, status'),
      sb.from('appointments').select('id, status, appt_date, appt_time, type, student_id, staff_id'),
      sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    check(users); check(concerns); check(appts);
    const u = users.data, c = concerns.data, a = appts.data;
    const usersById = {};
    u.forEach((row) => { usersById[row.id] = row; });
    const appointments = a.map((appointment) => ({
      ...appointment,
      student_name: usersById[appointment.student_id] ? usersById[appointment.student_id].full_name : 'Student',
      staff_name: usersById[appointment.staff_id] ? usersById[appointment.staff_id].full_name : 'Counselor',
    }));
    const today = todayStr();
    const activeAppointments = appointments
      .filter((appointment) => appointment.status === 'Pending' ||
        (appointment.status === 'Scheduled' && appointment.appt_date >= today))
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === 'Pending' ? -1 : 1;
        const dateOrder = String(left.appt_date).localeCompare(String(right.appt_date));
        return dateOrder || String(left.appt_time).localeCompare(String(right.appt_time));
      });
    const recentAppointments = appointments
      .filter((appointment) => appointment.status !== 'Pending' &&
        !(appointment.status === 'Scheduled' && appointment.appt_date >= today))
      .sort((left, right) => {
        const dateOrder = String(right.appt_date).localeCompare(String(left.appt_date));
        return dateOrder || String(right.appt_time).localeCompare(String(left.appt_time));
      });
    return {
      total_students: u.filter((x) => x.role === 'student').length,
      total_staff: u.filter((x) => x.role === 'staff').length,
      active_users: u.filter((x) => x.is_active !== false).length,
      total_concerns: c.length,
      pending_concerns: c.filter((x) => x.status === 'Pending').length,
      total_appointments: a.length,
      pending_appointments: a.filter((x) => x.status === 'Pending').length,
      appointments: [...activeAppointments, ...recentAppointments].slice(0, 8),
      recent_activity: notifs.data || [],
    };
  }

  if (action === 'users_list') {
    const role = params.get('role');
    const q = (params.get('q') || '').toLowerCase().trim();
    let rows = check(await sb.from('users').select('*').order('created_at', { ascending: false }));
    if (role) rows = rows.filter((u) => u.role === role);
    if (q) rows = rows.filter((u) =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.user_id_no || '').toLowerCase().includes(q));
    return { users: rows };
  }

  if (action === 'set_active') {
    const targetId = body.id;
    const isActive = !!body.is_active;
    if (targetId === user.id) throw new Error('You cannot deactivate your own account');
    await sb.from('users').update({
      is_active: isActive,
      deactivated_at: isActive ? null : nowStr(),
    }).eq('id', targetId);
    await auditLog('user_active_status_changed', 'user', targetId, { is_active: isActive });
    return { ok: true };
  }

  if (action === 'set_role') {
    const targetId = body.id;
    const role = body.role;
    if (!['student', 'staff', 'admin'].includes(role)) throw new Error('Invalid role');
    if (targetId === user.id) throw new Error('You cannot change your own role');
    await sb.from('users').update({ role }).eq('id', targetId);
    await auditLog('role_changed', 'user', targetId, { role });
    return { ok: true };
  }

  if (action === 'concerns_list') {
    const usersMap = await fetchAllUsersMap();
    let q = sb.from('concerns').select('*');
    const status = params.get('status');
    const category = params.get('category');
    if (status) q = q.eq('status', status);
    if (category) q = q.eq('category', category);
    let rows = check(await q);
    rows = rows.map((r) => ({
      ...r,
      student_name: usersMap[r.student_id] ? usersMap[r.student_id].full_name : null,
      staff_name: r.assigned_to && usersMap[r.assigned_to] ? usersMap[r.assigned_to].full_name : null,
    }));
    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { concerns: rows };
  }

  if (action === 'appointments_list') {
    const usersMap = await fetchAllUsersMap();
    let rows = check(await sb.from('appointments').select('*'));
    rows = rows.map((a) => ({
      ...a,
      student_name: usersMap[a.student_id] ? usersMap[a.student_id].full_name : null,
      staff_name: usersMap[a.staff_id] ? usersMap[a.staff_id].full_name : null,
    }));
    rows.sort((a, b) => (a.appt_date === b.appt_date ? String(a.appt_time).localeCompare(String(b.appt_time)) : String(a.appt_date).localeCompare(String(b.appt_date))));
    return { appointments: rows };
  }

  if (action === 'reports') {
    const startDate = params.get('start_date') || '';
    const endDate = params.get('end_date') || '';
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
        (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) ||
        (startDate && endDate && startDate > endDate)) {
      throw new Error('Choose a valid date range');
    }

    let concernsQuery = sb.from('concerns').select('id, student_id, category, is_urgent, status, created_at');
    let messagesQuery = sb.from('messages').select('id, sender_id, sent_at');
    let appointmentsQuery = sb.from('appointments').select('id, status, appt_date, staff_id');
    if (startDate) {
      concernsQuery = concernsQuery.gte('created_at', `${startDate} 00:00:00`);
      messagesQuery = messagesQuery.gte('sent_at', `${startDate} 00:00:00`);
      appointmentsQuery = appointmentsQuery.gte('appt_date', startDate);
    }
    if (endDate) {
      concernsQuery = concernsQuery.lte('created_at', `${endDate} 23:59:59`);
      messagesQuery = messagesQuery.lte('sent_at', `${endDate} 23:59:59`);
      appointmentsQuery = appointmentsQuery.lte('appt_date', endDate);
    }

    const [concernsRes, messagesRes, apptsRes] = await Promise.all([
      concernsQuery,
      messagesQuery,
      appointmentsQuery,
    ]);
    const concerns = check(concernsRes);
    const messages = check(messagesRes);
    const appts = check(apptsRes);
    const usersMap = await fetchAllUsersMap();

    const byCategory = {};
    concerns.forEach((c) => { byCategory[c.category] = (byCategory[c.category] || 0) + 1; });
    const concernStatuses = ['Pending', 'In Progress', 'Resolved', 'Closed'];
    const appointmentStatuses = ['Pending', 'Scheduled', 'Completed', 'Cancelled', 'No-Show'];
    const byStatus = (rows, statuses, key) => {
      const counts = {};
      rows.forEach((row) => { counts[row[key]] = (counts[row[key]] || 0) + 1; });
      return [
        ...statuses.map((status) => ({ status, count: counts[status] || 0 })),
        ...Object.keys(counts).filter((status) => !statuses.includes(status))
          .map((status) => ({ status, count: counts[status] })),
      ];
    };
    const byMonth = (rows, getDate) => {
      const counts = {};
      rows.forEach((row) => {
        const month = (getDate(row) || '').slice(0, 7);
        if (month) counts[month] = (counts[month] || 0) + 1;
      });
      return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count }));
    };

    const workloadMap = {};
    appts.forEach((a) => {
      const name = usersMap[a.staff_id] ? usersMap[a.staff_id].full_name : 'Unknown';
      workloadMap[name] = (workloadMap[name] || 0) + 1;
    });
    const counselor_workload = Object.entries(workloadMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const messageSenderMap = {};
    messages.forEach((message) => {
      const role = usersMap[message.sender_id] ? usersMap[message.sender_id].role : 'unknown';
      messageSenderMap[role] = (messageSenderMap[role] || 0) + 1;
    });

    return {
      period: { start_date: startDate, end_date: endDate },
      concerns_total: concerns.length,
      students_with_concerns: new Set(concerns.map((c) => c.student_id)).size,
      urgent_concerns: concerns.filter((c) => c.is_urgent).length,
      concerns_by_category: Object.entries(byCategory).map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      concerns_by_status: byStatus(concerns, concernStatuses, 'status'),
      concerns_by_month: byMonth(concerns, (c) => c.created_at),
      messages_total: messages.length,
      messages_by_sender_role: Object.entries(messageSenderMap)
        .map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count),
      messages_by_month: byMonth(messages, (m) => m.sent_at),
      appointments_total: appts.length,
      appointments_by_status: byStatus(appts, appointmentStatuses, 'status'),
      appointments_by_month: byMonth(appts, (a) => a.appt_date),
      counselor_workload,
    };
  }

  if (action === 'audit_logs') {
    const usersMap = await fetchAllUsersMap();
    const rows = check(await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200));
    return { logs: rows.map((r) => ({ ...r, actor_name: r.user_id && usersMap[r.user_id] ? usersMap[r.user_id].full_name : 'System' })) };
  }

  throw new Error('Unknown action');
}

// ---- announcements.php (v2) ----
async function handleAnnouncements(action, body) {
  const user = await requireLogin();

  if (action === 'list') {
    const rows = check(await sb.from('announcements').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(20));
    return { announcements: rows };
  }

  if (action === 'create') {
    if (user.role !== 'staff') throw new Error('Forbidden');
    const title = (body.title || '').trim();
    const text = (body.body || '').trim();
    if (!title || !text) throw new Error('Title and body are required');
    const row = check(await sb.from('announcements').insert({
      title, body: text, created_by: user.id, is_published: true, created_at: nowStr(),
    }).select().single());
    await auditLog('announcement_created', 'announcement', row.id, { title });
    return { id: row.id };
  }

  if (action === 'delete') {
    if (user.role !== 'staff') throw new Error('Forbidden');
    await sb.from('announcements').delete().eq('id', body.id);
    await auditLog('announcement_deleted', 'announcement', body.id, null);
    return { ok: true };
  }

  throw new Error('Unknown action');
}

// ---- feedback.php (v2) ----
async function handleFeedback(action, params, body) {
  const user = await requireLogin();

  if (action === 'submit') {
    if (user.role !== 'student') throw new Error('Only students can submit feedback');
    const appointmentId = body.appointment_id;
    const rating = parseInt(body.rating, 10);
    const text = (body.feedback || '').trim();
    if (!appointmentId || !rating || rating < 1 || rating > 5) throw new Error('A valid appointment and rating (1-5) are required');
    const row = check(await sb.from('feedback').insert({
      appointment_id: appointmentId, student_id: user.id, rating, feedback: text || null, created_at: nowStr(),
    }).select().single());
    await auditLog('feedback_submitted', 'appointment', appointmentId, { rating });
    return { id: row.id };
  }

  if (action === 'for_appointment') {
    const row = check(await sb.from('feedback').select('*').eq('appointment_id', params.get('appointment_id')).maybeSingle());
    return { feedback: row };
  }

  throw new Error('Unknown action');
}

// ---- dashboard.php ----
async function handleDashboard(action) {
  const user = await requireLogin();
  const usersMap = await fetchAllUsersMap();

  if (action === 'stats') {
    if (user.role === 'student') {
      const concerns = check(await sb.from('concerns').select('*').eq('student_id', user.id));
      const byStatus = {};
      concerns.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

      const appts = check(await sb.from('appointments').select('*').eq('student_id', user.id));
      const today = todayStr();
      const upcoming = appts.filter((a) => a.status === 'Scheduled' && a.appt_date >= today)
        .sort((a, b) => a.appt_date.localeCompare(b.appt_date));
      const nextAppointments = upcoming.slice(0, 3).map((a) => ({
        ...a, staff_name: usersMap[a.staff_id] ? usersMap[a.staff_id].full_name : null,
      }));

      const recentConcerns = [...concerns]
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        .slice(0, 3)
        .map((c) => ({
          ...c, staff_name: c.assigned_to && usersMap[c.assigned_to] ? usersMap[c.assigned_to].full_name : null,
        }));

      return {
        concerns_by_status: byStatus,
        upcoming_appointments: upcoming.length,
        next_appointments: nextAppointments,
        recent_concerns: recentConcerns,
      };
    }

    const concerns = check(await sb.from('concerns').select('*'));
    const byStatus = {};
    concerns.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
    const urgent = concerns.filter((c) => c.is_urgent && !['Resolved', 'Closed'].includes(c.status)).length;

    const appts = check(await sb.from('appointments').select('*').eq('staff_id', user.id));
    const today = todayStr();
    const upcoming = appts.filter((a) => a.status === 'Scheduled' && a.appt_date >= today)
      .sort((a, b) => a.appt_date.localeCompare(b.appt_date));
    const pendingAppointments = appts.filter((a) => a.status === 'Pending').length;

    const recent = concerns
      .filter((c) => !['Resolved', 'Closed'].includes(c.status))
      .sort((a, b) => {
        if (!!b.is_urgent !== !!a.is_urgent) return (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
        return (b.created_at || '').localeCompare(a.created_at || '');
      })
      .slice(0, 5)
      .map((c) => ({
        ...c,
        student_name: usersMap[c.student_id] ? usersMap[c.student_id].full_name : null,
      }));

    const nextAppointments = upcoming.slice(0, 5).map((a) => ({
      ...a, student_name: usersMap[a.student_id] ? usersMap[a.student_id].full_name : null,
    }));

    return {
      concerns_by_status: byStatus,
      urgent_count: urgent,
      upcoming_appointments: upcoming.length,
      pending_appointments: pendingAppointments,
      recent_concerns: recent,
      next_appointments: nextAppointments,
    };
  }

  if (action === 'reports') {
    if (user.role !== 'staff') throw new Error('Forbidden');

    const concerns = check(await sb.from('concerns').select('*'));
    const appts = check(await sb.from('appointments').select('id'));
    const students = check(await sb.from('users').select('id').eq('role', 'student'));

    const byCategoryMap = {};
    concerns.forEach((c) => { byCategoryMap[c.category] = (byCategoryMap[c.category] || 0) + 1; });
    const by_category = Object.entries(byCategoryMap)
      .map(([category, c]) => ({ category, c })).sort((a, b) => b.c - a.c);

    const byStatusMap = {};
    concerns.forEach((c) => { byStatusMap[c.status] = (byStatusMap[c.status] || 0) + 1; });
    const by_status = Object.entries(byStatusMap).map(([status, c]) => ({ status, c }));

    const byMonthMap = {};
    concerns.forEach((c) => {
      const ym = (c.created_at || '').slice(0, 7);
      if (ym) byMonthMap[ym] = (byMonthMap[ym] || 0) + 1;
    });
    const by_month = Object.entries(byMonthMap)
      .map(([ym, c]) => ({ ym, c })).sort((a, b) => a.ym.localeCompare(b.ym));

    const totals = {
      total_concerns: concerns.length,
      resolved: concerns.filter((c) => c.status === 'Resolved').length,
      total_appointments: appts.length,
      total_students: students.length,
    };

    return { by_category, by_status, by_month, totals };
  }

  throw new Error('Unknown action');
}

// ---- notifications.php ----
async function handleNotifications(action, body) {
  const user = await requireLogin();

  if (action === 'list') {
    const rows = check(await sb.from('notifications').select('*').eq('user_id', user.id));
    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { notifications: rows.slice(0, 50) };
  }

  if (action === 'mark_read') {
    await sb.from('notifications').update({ is_read: true }).eq('id', body.id).eq('user_id', user.id);
    return { ok: true };
  }

  if (action === 'mark_all_read') {
    await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    return { ok: true };
  }

  throw new Error('Unknown action');
}

// ---- profile.php ----
async function handleProfile(action, body) {
  const user = await requireLogin();

  if (action === 'update') {
    const updates = {
      full_name: (body.full_name || '').trim() || user.full_name,
      position: (body.position || '').trim() || null,
    };
    const updated = check(await sb.from('users').update(updates).eq('id', user.id).select().single());
    _usersMapCache = null;
    return { user: updated };
  }

  if (action === 'change_password') {
    const current = body.current_password || '';
    const next = body.new_password || '';
    if (next.length < 6) throw new Error('New password must be at least 6 characters');

    const { error: signInErr } = await sb.auth.signInWithPassword({ email: user.email, password: current });
    if (signInErr) throw new Error('Current password is incorrect');

    const { error } = await sb.auth.updateUser({ password: next });
    if (error) throw new Error(friendlyAuthError(error, 'Could not update password'));
    await auditLog('password_changed', 'user', user.id, null);
    return { ok: true };
  }

  throw new Error('Unknown action');
}

// ============================================================================
// Shared UI helpers (unchanged)
// ============================================================================

function badgeClass(status) {
  const map = {
    'Pending': 'badge-pending',
    'In Progress': 'badge-inprogress',
    'Resolved': 'badge-resolved',
    'Closed': 'badge-closed',
    'Scheduled': 'badge-scheduled',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-cancelled',
  };
  return map[status] || 'badge-pending';
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Each role has its own login page (login/student.html, login/staff.html,
// admindashboard/). Pages live in per-role folders, so the folder tells us
// which login page to send someone back to.
function loginUrl(role) {
  const p = location.pathname;
  const r = role || (p.includes('/admin/') ? 'admin' : p.includes('/staff/') ? 'staff' : 'student');
  return (window.ROOT_PATH || '') + (r === 'admin' ? 'admindashboard/' : 'login/' + r + '.html');
}

async function requireAuth() {
  try {
    const { user } = await api('/api/auth.php?action=me');
    if (!user) { location.href = loginUrl(); return null; }
    // Role guard: student/, staff/ and admin/ pages only open for that role.
    // Anyone else is sent to their own dashboard (shared/ pages are open to all).
    const m = location.pathname.match(/\/(student|staff|admin)\/[^/]*$/);
    if (m && user.role !== m[1]) {
      location.href = (window.ROOT_PATH || '') + user.role + '/dashboard.html';
      return null;
    }
    return user;
  } catch {
    location.href = loginUrl();
    return null;
  }
}

// Asks for confirmation first, then signs out.
function logout() {
  if (document.getElementById('logout-modal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'logout-modal';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" style="max-width:380px">
      <div class="modal-header"><h3 id="logout-title">Log out?</h3></div>
      <p style="margin:0 0 20px;color:var(--text-secondary);font-size:14px">Are you sure you want to log out?</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn btn-outline btn-sm" id="logout-cancel">Cancel</button>
        <button type="button" class="btn btn-danger btn-sm" id="logout-confirm">Yes, log out</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('logout-cancel').onclick = close;
  const confirmBtn = document.getElementById('logout-confirm');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true; confirmBtn.textContent = 'Logging out...';
    await performLogout();
  };
  confirmBtn.focus();
}

async function performLogout() {
  let role = null;
  try { const { user } = await api('/api/auth.php?action=me'); role = user && user.role; } catch {}
  await auditLog('logout', 'user', null, null);
  await api('/api/auth.php?action=logout', { method: 'POST' });
  location.href = loginUrl(role);
}

// ============================================================================
// Real-time chat helpers (v2)
// ============================================================================
// Subscribes to new/updated messages for one concern's thread. RLS still
// applies to realtime — a user cannot receive events for a concern they
// aren't authorized to read (see can_access_case() in schema.sql).
// Returns the channel so the caller can removeChannel() it on page unload.
function subscribeToConcernMessages(concernId, onChange) {
  const channel = sb.channel(`concern-${concernId}-messages`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `concern_id=eq.${concernId}` }, onChange)
    .subscribe();
  return channel;
}

function unsubscribeChannel(channel) {
  if (channel) sb.removeChannel(channel);
}

async function markMessagesRead(concernId, currentUserId) {
  try {
    await sb.from('messages')
      .update({ read_at: nowStr() })
      .eq('concern_id', concernId)
      .is('read_at', null)
      .neq('sender_id', currentUserId);
  } catch { /* best-effort */ }
}

function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
}

async function refreshNotifBadge() {
  try {
    const { notifications } = await api('/api/notifications.php?action=list');
    const unread = notifications.filter((n) => !n.is_read).length;
    const el = document.getElementById('notif-badge');
    if (el) {
      if (unread > 0) { el.textContent = unread; el.classList.remove('hidden'); }
      else el.classList.add('hidden');
    }
  } catch {}
}
