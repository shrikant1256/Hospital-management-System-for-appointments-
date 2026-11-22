const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, 'carewell.sqlite'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    specialty TEXT NOT NULL REFERENCES departments(name),
    years_experience INTEGER NOT NULL CHECK (years_experience > 0),
    rating REAL NOT NULL CHECK (rating >= 0 AND rating <= 5),
    next_available TEXT NOT NULL,
    fee_rupees INTEGER NOT NULL CHECK (fee_rupees >= 0),
    avatar_color TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    confirmation_code TEXT NOT NULL UNIQUE,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, appointment_date);
`);

const previousAppointmentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appointments'").get()?.sql || '';
if (/UNIQUE\s*\(\s*doctor_id\s*,\s*appointment_date\s*,\s*appointment_time\s*\)/i.test(previousAppointmentSchema)) {
  db.exec(`
    DROP INDEX IF EXISTS idx_appointments_patient;
    ALTER TABLE appointments RENAME TO appointments_legacy;
    CREATE TABLE appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirmation_code TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      doctor_id TEXT NOT NULL REFERENCES doctors(id),
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO appointments SELECT * FROM appointments_legacy;
    DROP TABLE appointments_legacy;
    CREATE INDEX idx_appointments_patient ON appointments(patient_id, appointment_date);
  `);
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
  ON appointments (doctor_id, appointment_date, appointment_time) WHERE status = 'booked'`);

const seedDoctors = [
  ['dr-anika-rao', 'Dr. Anika Rao', 'AR', 'Cardiology', 12, 4.9, 'Today, 2:30 PM', 800, 'avatar-green'],
  ['dr-rahul-mehta', 'Dr. Rahul Mehta', 'RM', 'Dermatology', 9, 4.8, 'Today, 4:00 PM', 650, 'avatar-coral'],
  ['dr-sana-kapoor', 'Dr. Sana Kapoor', 'SK', 'Neurology', 14, 5.0, 'Tomorrow, 9:30 AM', 1000, 'avatar-blue'],
  ['dr-isha-nair', 'Dr. Isha Nair', 'IN', 'Orthopedics', 11, 4.9, 'Tomorrow, 11:00 AM', 750, 'avatar-purple'],
  ['dr-kabir-sen', 'Dr. Kabir Sen', 'KS', 'Pediatrics', 8, 4.9, 'Today, 3:15 PM', 600, 'avatar-gold'],
  ['dr-meera-joshi', 'Dr. Meera Joshi', 'MJ', 'General Medicine', 10, 4.8, 'Today, 5:00 PM', 500, 'avatar-rose']
];

const seed = db.transaction(() => {
  const addDepartment = db.prepare('INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)');
  const addDoctor = db.prepare(`INSERT OR IGNORE INTO doctors
    (id, name, initials, specialty, years_experience, rating, next_available, fee_rupees, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const doctor of seedDoctors) {
    const [, , , specialty] = doctor;
    const departmentId = specialty.toLowerCase().replaceAll(' ', '-');
    addDepartment.run(departmentId, specialty);
    addDoctor.run(...doctor);
  }
});
seed();

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.get('/', (_request, response) => response.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (_request, response) => response.sendFile(path.join(__dirname, 'styles.css')));
app.get('/app.js', (_request, response) => response.sendFile(path.join(__dirname, 'app.js')));

const appointmentTimes = new Set(['09:00 AM', '10:30 AM', '11:45 AM', '02:00 PM', '03:15 PM', '04:30 PM']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function publicAppointment(row) {
  return {
    confirmationCode: row.confirmation_code,
    patientName: row.full_name,
    email: row.email,
    doctorName: row.doctor_name,
    specialty: row.specialty,
    date: row.appointment_date,
    time: row.appointment_time,
    status: row.status
  };
}

app.get('/api/health', (_request, response) => response.json({ ok: true, database: 'sqlite' }));

app.get('/api/doctors', (request, response) => {
  const specialty = typeof request.query.specialty === 'string' ? request.query.specialty.trim() : '';
  const rows = specialty
    ? db.prepare('SELECT * FROM doctors WHERE active = 1 AND specialty = ? ORDER BY name').all(specialty)
    : db.prepare('SELECT * FROM doctors WHERE active = 1 ORDER BY name').all();

  response.json(rows.map(doctor => ({
    id: doctor.id,
    name: doctor.name,
    initials: doctor.initials,
    specialty: doctor.specialty,
    experience: `${doctor.years_experience} years experience`,
    rating: doctor.rating.toFixed(1),
    next: doctor.next_available,
    fee: `₹${doctor.fee_rupees.toLocaleString('en-IN')}`,
    color: doctor.avatar_color
  })));
});

app.get('/api/availability', (request, response) => {
  const doctorId = typeof request.query.doctor === 'string' ? request.query.doctor.trim() : '';
  const date = typeof request.query.date === 'string' ? request.query.date : '';
  if (!db.prepare('SELECT id FROM doctors WHERE id = ? AND active = 1').get(doctorId)) {
    return response.status(400).json({ error: 'Choose an available doctor.' });
  }
  if (!validDate(date) || date < currentLocalDate()) return response.status(400).json({ error: 'Choose today or a future date.' });

  const booked = new Set(db.prepare(`SELECT appointment_time FROM appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status = 'booked'`).all(doctorId, date).map(row => row.appointment_time));
  response.json([...appointmentTimes].filter(time => !booked.has(time)));
});

const createAppointment = db.transaction(({ confirmationCode, patientName, email, phone, doctorId, date, time, note }) => {
  db.prepare(`INSERT INTO patients (full_name, email, phone) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, phone = excluded.phone`)
    .run(patientName, email, phone);

  const patient = db.prepare('SELECT id FROM patients WHERE email = ?').get(email);
  db.prepare(`INSERT INTO appointments
    (confirmation_code, patient_id, doctor_id, appointment_date, appointment_time, notes)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(confirmationCode, patient.id, doctorId, date, time, note);

  return db.prepare(`SELECT a.confirmation_code, p.full_name, p.email, d.name AS doctor_name,
      d.specialty, a.appointment_date, a.appointment_time, a.status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    WHERE a.confirmation_code = ?`).get(confirmationCode);
});

app.post('/api/appointments', (request, response) => {
  const body = request.body || {};
  const patientName = typeof body.patientName === 'string' ? body.patientName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const doctorId = typeof body.doctor === 'string' ? body.doctor.trim() : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const time = typeof body.time === 'string' ? body.time : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  if (patientName.length < 2 || patientName.length > 100) return response.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
  if (email.length > 254 || !emailPattern.test(email)) return response.status(400).json({ error: 'Enter a valid email address.' });
  if (phone.length < 7 || phone.length > 30) return response.status(400).json({ error: 'Enter a valid phone number.' });
  if (!validDate(date) || date < currentLocalDate()) return response.status(400).json({ error: 'Choose today or a future date.' });
  if (!appointmentTimes.has(time)) return response.status(400).json({ error: 'Choose one of the available appointment times.' });

  const doctor = db.prepare('SELECT id FROM doctors WHERE id = ? AND active = 1').get(doctorId);
  if (!doctor) return response.status(400).json({ error: 'Choose an available doctor.' });

  try {
    const confirmationCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    const appointment = createAppointment({ confirmationCode, patientName, email, phone, doctorId, date, time, note });
    response.status(201).json(publicAppointment(appointment));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return response.status(409).json({ error: 'That time was just booked. Please choose another available time.' });
    }
    console.error('Could not create appointment:', error.message);
    response.status(500).json({ error: 'We could not save your appointment. Please try again.' });
  }
});

app.get('/api/appointments', (request, response) => {
  const email = typeof request.query.email === 'string' ? request.query.email.trim().toLowerCase() : '';
  const reference = typeof request.query.reference === 'string' ? request.query.reference.trim().toUpperCase() : '';
  if (!emailPattern.test(email) || !/^[A-F0-9]{16}$/.test(reference)) {
    return response.status(400).json({ error: 'Enter the email address and booking reference from your confirmation.' });
  }

  const appointment = db.prepare(`SELECT a.confirmation_code, p.full_name, p.email, d.name AS doctor_name,
      d.specialty, a.appointment_date, a.appointment_time, a.status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    WHERE p.email = ? COLLATE NOCASE AND a.confirmation_code = ?`)
    .get(email, reference);

  if (!appointment) return response.status(404).json({ error: 'We couldn’t find an appointment with those details.' });
  response.json(publicAppointment(appointment));
});

app.get('/api/management/appointments', (request, response) => {
  const allowedStatuses = new Set(['all', 'booked', 'completed', 'cancelled']);
  const status = typeof request.query.status === 'string' ? request.query.status : 'all';
  const date = typeof request.query.date === 'string' ? request.query.date : '';
  if (!allowedStatuses.has(status)) return response.status(400).json({ error: 'Choose a valid appointment status.' });
  if (date && !validDate(date)) return response.status(400).json({ error: 'Choose a valid date filter.' });

  const summaryRow = db.prepare(`SELECT COUNT(*) AS total,
      SUM(status = 'booked') AS booked,
      SUM(status = 'booked' AND appointment_date >= ?) AS upcoming,
      SUM(status = 'completed') AS completed,
      SUM(status = 'cancelled') AS cancelled
    FROM appointments`).get(currentLocalDate());
  const filters = [];
  const parameters = [];
  if (status !== 'all') { filters.push('a.status = ?'); parameters.push(status); }
  if (date) { filters.push('a.appointment_date = ?'); parameters.push(date); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT a.confirmation_code, p.full_name, d.name AS doctor_name, d.specialty,
      a.appointment_date, a.appointment_time, a.status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    ${where}
    ORDER BY a.appointment_date, a.appointment_time, p.full_name`).all(...parameters);

  response.json({
    summary: Object.fromEntries(Object.entries(summaryRow).map(([key, value]) => [key, Number(value) || 0])),
    appointments: rows.map(row => ({
      confirmationCode: row.confirmation_code,
      patientName: row.full_name,
      doctorName: row.doctor_name,
      specialty: row.specialty,
      date: row.appointment_date,
      time: row.appointment_time,
      status: row.status
    }))
  });
});

app.patch('/api/management/appointments/:reference', (request, response) => {
  const reference = typeof request.params.reference === 'string' ? request.params.reference.trim().toUpperCase() : '';
  const status = request.body?.status;
  if (!/^[A-F0-9]{16}$/.test(reference)) return response.status(400).json({ error: 'Enter a valid booking reference.' });
  if (!['booked', 'completed', 'cancelled'].includes(status)) return response.status(400).json({ error: 'Choose a valid appointment status.' });

  try {
    const result = db.prepare('UPDATE appointments SET status = ? WHERE confirmation_code = ?').run(status, reference);
    if (!result.changes) return response.status(404).json({ error: 'Appointment not found.' });
    const appointment = db.prepare(`SELECT a.confirmation_code, p.full_name, p.email, d.name AS doctor_name,
        d.specialty, a.appointment_date, a.appointment_time, a.status
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      WHERE a.confirmation_code = ?`).get(reference);
    response.json(publicAppointment(appointment));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return response.status(409).json({ error: 'This time slot has already been booked and cannot be restored.' });
    }
    console.error('Could not update appointment:', error.message);
    response.status(500).json({ error: 'We could not update this appointment. Please try again.' });
  }
});

app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));

app.listen(port, () => {
  console.log(`Carewell is running at http://localhost:${port}`);
});

function closeDatabase() {
  db.close();
}
process.on('SIGINT', () => { closeDatabase(); process.exit(0); });
process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });
