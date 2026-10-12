const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const dbDir = __dirname;
fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, "college_db.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  DROP TABLE IF EXISTS students;
  DROP TABLE IF EXISTS courses;

  CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_name TEXT NOT NULL UNIQUE,
    seats_available INTEGER NOT NULL DEFAULT 0 CHECK(seats_available >= 0)
  );

  CREATE TABLE students (
    student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    roll_no TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    course_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(course_id)
  );
`);

const insertCourse = db.prepare(
  "INSERT INTO courses (course_name, seats_available) VALUES (?, ?)"
);

[
  ["Computer Science & Engineering", 24],
  ["Artificial Intelligence & Data Science", 18],
  ["Information Technology", 20],
  ["Computer Networks", 0],
  ["Cyber Security", 15],
  ["Electronics & Communication", 12]
].forEach(([name, seats]) => insertCourse.run(name, seats));

const insertStudent = db.prepare(`
  INSERT INTO students (name, roll_no, email, course_id)
  VALUES (?, ?, ?, ?)
`);

[
  ["Vansh Tomar", "CSE101", "vanshjaat@example.com", 1],
  ["Vishal Singh", "CSE102", "vishalsingh@example.com", 2],
  ["Yashraj Rana", "CSE103", "vishal@example.com", 3]
].forEach((student) => insertStudent.run(...student));

db.prepare("UPDATE courses SET seats_available = seats_available - 1 WHERE course_id = 1").run();
db.prepare("UPDATE courses SET seats_available = seats_available - 1 WHERE course_id = 2").run();
db.prepare("UPDATE courses SET seats_available = seats_available - 1 WHERE course_id = 3").run();

console.log("Database initialized successfully.");
db.close();