# Carewell Hospital Appointment System

A responsive BCA project demonstrating an online hospital appointment system with a Node.js backend and SQLite database.

## Run locally

1. Install [Node.js 20 or newer](https://nodejs.org/).
2. Open a terminal in this folder.
3. Run `npm install` once.
4. Run `npm start`.
5. Open <http://localhost:3000> in a browser.

Keep the terminal running while using the site. Opening `index.html` directly bypasses Express, so database-backed doctor lists and appointment booking will not connect.

The SQLite database is created automatically at `data/carewell.sqlite` the first time the server starts. Sample departments and doctors are seeded automatically.

## Features

- Browse doctors and specialties from the database
- Check available appointment times for a doctor and date
- Book appointments with server-side validation and duplicate-slot protection
- Look up an appointment with its email address and confirmation reference
- Store departments, doctors, patients, and appointments in SQLite
- Manage appointments from an admin demo screen with pending, upcoming, completed, and cancelled counts
- Filter the appointment list by status or date, mark visits completed, cancel bookings, or restore cancelled bookings
- Show a tap-to-call link for India’s nationwide emergency number, 112
- Show a separate tap-to-call consultation line at +91 91233 21220

## Demo doctors

- Dr. Anika Rao — Cardiology
- Dr. Rahul Mehta — Dermatology
- Dr. Sana Kapoor — Neurology
- Dr. Isha Nair — Orthopedics
- Dr. Kabir Sen — Pediatrics
- Dr. Meera Joshi — General Medicine

## Three-tier architecture

1. **Presentation layer:** HTML, CSS, and browser JavaScript.
2. **Application layer:** Express routes in `server.js` handle validation, available times, booking, and appointment lookup.
3. **Data layer:** SQLite tables store departments, doctors, patients, and appointments with foreign keys and a unique doctor/date/time constraint.

## API routes

- `GET /api/health` — service and database status
- `GET /api/doctors?specialty=Cardiology` — list doctors, optionally by specialty
- `GET /api/availability?doctor=dr-anika-rao&date=2026-11-22` — available time slots
- `POST /api/appointments` — create a booking
- `GET /api/appointments?email=...&reference=...` — retrieve a booking using its confirmation details
- `GET /api/management/appointments` — summary counts and appointment list for the manager screen
- `PATCH /api/management/appointments/:reference` — update a booking to pending, completed, or cancelled

The confirmation reference is shown after booking. Keep it with the email address used for the booking.

This is an academic demonstration and has no patient login, email delivery, or production-grade access controls. Do not use it for real patient information.
