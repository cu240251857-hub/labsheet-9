const express = require("express");
const cors = require("cors");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new DatabaseSync(path.join(__dirname, "db", "college_db.sqlite"));

db.exec("PRAGMA foreign_keys = ON;");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(body) {
  const errors = [];
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const roll = typeof body.roll_no === "string" ? body.roll_no.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const courseId = Number(body.course_id);

  if (!name) errors.push("Full name is required.");
  else if (name.length < 2) errors.push("Name must contain at least 2 characters.");

  if (!roll) errors.push("Roll number is required.");
  else if (!/^[A-Za-z0-9-]{3,20}$/.test(roll)) errors.push("Enter a valid roll number.");

  if (!email || !emailRegex.test(email)) errors.push("Enter a valid email address.");
  if (!Number.isInteger(courseId) || courseId <= 0) errors.push("Please select a valid course.");

  return errors;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "online", service: "Campus Registration API" });
});

app.get("/api/courses", (_req, res) => {
  try {
    const courses = db.prepare(`
      SELECT course_id, course_name, seats_available
      FROM courses
      ORDER BY course_id
    `).all();
    res.json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch courses." });
  }
});

app.get("/api/students", (_req, res) => {
  try {
    const students = db.prepare(`
      SELECT s.student_id, s.name, s.roll_no, s.email,
             s.course_id, c.course_name
      FROM students s
      JOIN courses c ON s.course_id = c.course_id
      ORDER BY s.student_id DESC
    `).all();
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch students." });
  }
});

app.get("/api/stats", (_req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM courses) AS total_courses,
        (SELECT COUNT(*) FROM students) AS total_students,
        (SELECT COALESCE(SUM(seats_available), 0) FROM courses) AS available_seats,
        (SELECT COALESCE(SUM(seats_available), 0) + COUNT(*)
         FROM courses CROSS JOIN students) AS unused_helper
    `).get();

    const capacity = db.prepare(`
      SELECT COALESCE(SUM(seats_available), 0) AS available_seats,
             COALESCE(SUM(seats_available), 0) +
             (SELECT COUNT(*) FROM students) AS total_capacity
      FROM courses
    `).get();

    res.json({
      total_courses: stats.total_courses,
      total_students: stats.total_students,
      available_seats: stats.available_seats,
      total_capacity: capacity.total_capacity,
      filled_seats: stats.total_students
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard statistics." });
  }
});

app.post("/api/register", (req, res) => {
  const errors = validateRegistration(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const name = req.body.name.trim();
  const rollNo = req.body.roll_no.trim();
  const email = req.body.email.trim();
  const courseId = Number(req.body.course_id);

  db.exec("BEGIN");
  try {
    const existing = db.prepare(
      "SELECT student_id FROM students WHERE LOWER(roll_no) = LOWER(?)"
    ).get(rollNo);

    if (existing) {
      db.exec("ROLLBACK");
      return res.status(409).json({ error: "This roll number is already registered." });
    }

    const course = db.prepare(
      "SELECT course_id, course_name, seats_available FROM courses WHERE course_id = ?"
    ).get(courseId);

    if (!course) {
      db.exec("ROLLBACK");
      return res.status(400).json({ error: "Selected course does not exist." });
    }

    if (course.seats_available <= 0) {
      db.exec("ROLLBACK");
      return res.status(409).json({ error: "No seats are available in this course." });
    }

    const result = db.prepare(`
      INSERT INTO students (name, roll_no, email, course_id)
      VALUES (?, ?, ?, ?)
    `).run(name, rollNo, email, courseId);

    db.prepare(`
      UPDATE courses
      SET seats_available = seats_available - 1
      WHERE course_id = ?
    `).run(courseId);

    db.exec("COMMIT");

    res.status(201).json({
      message: `Registration successful for ${course.course_name}.`,
      student_id: result.lastInsertRowid
    });
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    console.error(err);
    res.status(500).json({ error: "Registration failed due to a server error." });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found." });
  next();
});

app.listen(PORT, () => {
  console.log(`Campus Registration running at http://localhost:${PORT}`);
});