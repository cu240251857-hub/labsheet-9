const state = { courses: [], students: [], stats: {} };

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindForm();
  $("studentSearch").addEventListener("input", renderStudents);
  $("refreshBtn").addEventListener("click", loadAll);
  $("exportBtn").addEventListener("click", exportCSV);
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  loadAll();
});

function bindNavigation() {
  document.querySelectorAll("[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });
}

function showSection(section) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const page = $(section);
  if (!page) return;
  page.classList.add("active");
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add("active");
  $("pageTitle").textContent = section.charAt(0).toUpperCase() + section.slice(1);
  $("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function loadAll() {
  try {
    const [courses, students, stats, health] = await Promise.all([
      api("/api/courses"),
      api("/api/students"),
      api("/api/stats"),
      api("/api/health")
    ]);
    state.courses = courses;
    state.students = students;
    state.stats = stats;
    renderDashboard();
    renderCourseOptions();
    renderStudents();
    renderCourseCards();
    $("apiStatus").textContent = health.status === "online" ? "Online" : "Offline";
    $("apiDot").classList.add("online");
  } catch (err) {
    $("apiStatus").textContent = "Offline";
    $("apiDot").classList.remove("online");
    toast(err.message, "error");
  }
}

function renderDashboard() {
  const s = state.stats;
  $("totalCourses").textContent = s.total_courses ?? 0;
  $("totalStudents").textContent = s.total_students ?? 0;
  $("availableSeats").textContent = s.available_seats ?? 0;
  const rate = s.total_capacity ? Math.round((s.filled_seats / s.total_capacity) * 100) : 0;
  $("enrollmentRate").textContent = `${rate}%`;

  $("courseOverview").innerHTML = state.courses.slice(0, 5).map(c => {
    const total = Math.max(c.seats_available, 1);
    const pct = Math.min(100, Math.max(0, 100 - (c.seats_available / (total + 5) * 100)));
    return `<div class="course-row">
      <div><strong>${escapeHtml(c.course_name)}</strong><small>${c.seats_available > 0 ? "Enrollment open" : "Fully booked"}</small></div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="seat-count">${c.seats_available} left</div>
    </div>`;
  }).join("") || `<p style="color:#778096;font-size:11px">No courses found.</p>`;

  $("recentStudents").innerHTML = state.students.slice(0, 5).map(studentRow).join("") || emptyRow(5, "No registrations yet.");
}

function renderCourseOptions() {
  const select = $("course_id");
  select.innerHTML = `<option value="">Choose a course...</option>` +
    state.courses.map(c => `<option value="${c.course_id}" ${c.seats_available <= 0 ? "disabled" : ""}>
      ${escapeHtml(c.course_name)} ${c.seats_available > 0 ? `— ${c.seats_available} seats` : "— Full"}
    </option>`).join("");
}

function renderStudents() {
  const query = $("studentSearch").value.trim().toLowerCase();
  const filtered = state.students.filter(s =>
    [s.name, s.roll_no, s.email, s.course_name].some(v => String(v).toLowerCase().includes(query))
  );
  $("studentsTable").innerHTML = filtered.map(s => `
    <tr>
      <td>${studentIdentity(s)}</td>
      <td><strong>${escapeHtml(s.roll_no)}</strong></td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.course_name)}</td>
      <td>#${s.student_id}</td>
    </tr>`).join("") || emptyRow(5, query ? "No matching students." : "No registrations yet.");
}

function renderCourseCards() {
  const totalCapacity = state.stats.total_capacity || 1;
  $("courseCards").innerHTML = state.courses.map((c, i) => {
    const capacity = Math.max(c.seats_available + (state.students.filter(s => s.course_id === c.course_id).length), 1);
    const filled = capacity - c.seats_available;
    const pct = Math.round((filled / capacity) * 100);
    return `<article class="course-card">
      <div class="course-card-top"><div><span class="eyebrow">COURSE ${String(i+1).padStart(2,"0")}</span><h2>${escapeHtml(c.course_name)}</h2></div><div class="course-number">${i+1}</div></div>
      <div class="course-meta"><span>Enrollment</span><strong>${filled}/${capacity}</strong></div>
      <div class="full-course-progress"><i style="width:${pct}%"></i></div>
      <div class="course-meta"><span class="${c.seats_available === 0 ? "no-seats" : ""}">${c.seats_available === 0 ? "No seats available" : `${c.seats_available} seats available`}</span><span>${pct}% filled</span></div>
    </article>`;
  }).join("");
}

function bindForm() {
  $("course_id").addEventListener("change", () => {
    const course = state.courses.find(c => c.course_id === Number($("course_id").value));
    const hint = $("courseHint");
    if (!course) { hint.classList.add("hidden"); return; }
    hint.classList.remove("hidden");
    hint.textContent = course.seats_available > 0
      ? `✓ ${course.seats_available} seats currently available in ${course.course_name}.`
      : `✕ ${course.course_name} is currently full.`;
  });

  $("registrationForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const payload = {
      name: $("name").value.trim(),
      roll_no: $("roll_no").value.trim(),
      email: $("email").value.trim(),
      course_id: $("course_id").value
    };

    const errors = validateClient(payload);
    if (errors.length) {
      errors.forEach(({ id, message }) => $(id).textContent = message);
      return;
    }

    const button = $("submitBtn");
    button.disabled = true;
    button.textContent = "Registering...";

    try {
      const result = await api("/api/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      toast(result.message, "success");
      $("registrationForm").reset();
      $("courseHint").classList.add("hidden");
      await loadAll();
      showSection("students");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Register Student";
    }
  });
}

function validateClient(p) {
  const errors = [];
  if (!p.name || p.name.length < 2) errors.push({ id:"nameError", message:"Enter a valid full name." });
  if (!/^[A-Za-z0-9-]{3,20}$/.test(p.roll_no)) errors.push({ id:"rollError", message:"Use 3–20 letters, numbers or hyphens." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) errors.push({ id:"emailError", message:"Enter a valid email address." });
  if (!p.course_id) errors.push({ id:"courseError", message:"Select a course." });
  return errors;
}

function clearErrors() {
  ["nameError","rollError","emailError","courseError"].forEach(id => $(id).textContent = "");
}

function studentIdentity(s) {
  const initials = s.name.split(/\s+/).map(x => x[0]).slice(0,2).join("").toUpperCase();
  return `<div class="student-cell"><div class="mini-avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(s.name)}</strong><small>Student ID #${s.student_id}</small></div></div>`;
}

function studentRow(s) {
  return `<tr>
    <td>${studentIdentity(s)}</td>
    <td>${escapeHtml(s.roll_no)}</td>
    <td>${escapeHtml(s.email)}</td>
    <td>${escapeHtml(s.course_name)}</td>
    <td><span class="badge">● Registered</span></td>
  </tr>`;
}

function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" style="text-align:center;color:#8b92a3;padding:30px">${escapeHtml(text)}</td></tr>`;
}

function exportCSV() {
  if (!state.students.length) return toast("No students to export.", "error");
  const header = ["Student ID","Name","Roll Number","Email","Course"];
  const rows = state.students.map(s => [s.student_id,s.name,s.roll_no,s.email,s.course_name]);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "registered-students.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("CSV exported successfully.", "success");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
}

let toastTimer;
function toast(message, type = "") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}