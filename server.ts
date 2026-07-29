import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// NeonDb PostgreSQL Connection String
const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_sjWzobStH3q6@ep-polished-frog-apig4e9f-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({ connectionString });

// Helper to execute DB queries
async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

// Database Initialization (Schema Creation and Seeding)
async function initDb() {
  try {
    console.log("⚡ Connecting to NeonDb PostgreSQL...");

    // 1. Create tables if not exist
    await query(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(100) PRIMARY KEY,
        student_id VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        class_id VARCHAR(100) NOT NULL,
        parents_name VARCHAR(255),
        parents_email VARCHAR(255),
        parents_phone VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        academic_year VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        date VARCHAR(50),
        budget_target NUMERIC DEFAULT 0,
        actual_income NUMERIC DEFAULT 0,
        actual_expense NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(100) PRIMARY KEY,
        date VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT,
        student_id VARCHAR(100),
        student_name VARCHAR(255),
        class_id VARCHAR(100),
        period VARCHAR(100),
        payment_method VARCHAR(100),
        recorded_by VARCHAR(255),
        event_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS student_bills (
        id VARCHAR(100) PRIMARY KEY,
        student_id VARCHAR(100) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        student_class VARCHAR(100) NOT NULL,
        parents_name VARCHAR(255),
        parents_phone VARCHAR(100),
        parents_email VARCHAR(255),
        period VARCHAR(100) NOT NULL,
        amount_required NUMERIC DEFAULT 150000,
        amount_paid NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'unpaid',
        due_date VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS classes (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);

    // Check if initial seed is needed
    const { rows: existingStudents } = await query('SELECT COUNT(*) FROM students');
    if (parseInt(existingStudents[0].count, 10) === 0) {
      console.log("🌱 Seeding initial demo data into NeonDb PostgreSQL...");
      await seedInitialData();
    } else {
      console.log("✅ NeonDb PostgreSQL tables verified and active.");
    }
  } catch (err) {
    console.error("❌ Error initializing NeonDb PostgreSQL:", err);
  }
}

async function seedInitialData() {
  const sampleStudents = [
    { id: 'std_01', studentId: '10928371', name: 'Ahmad Fauzi', classId: 'Kelas 7-A', parentsName: 'Budi Fauzi', parentsEmail: 'budi.fauzi@example.com', parentsPhone: '081234567890', status: 'active', academicYear: '2025/2026' },
    { id: 'std_02', studentId: '10928372', name: 'Siti Aminah', classId: 'Kelas 7-A', parentsName: 'Yusuf Amin', parentsEmail: 'yusuf.a@example.com', parentsPhone: '081298765432', status: 'active', academicYear: '2025/2026' },
    { id: 'std_03', studentId: '10928373', name: 'Dewi Lestari', classId: 'Kelas 8-B', parentsName: 'Eko Lestari', parentsEmail: 'eko.l@example.com', parentsPhone: '085711223344', status: 'active', academicYear: '2025/2026' },
    { id: 'std_04', studentId: '10928374', name: 'Rian Hidayat', classId: 'Kelas 8-B', parentsName: 'Aris Hidayat', parentsEmail: 'aris.h@example.com', parentsPhone: '087855667788', status: 'active', academicYear: '2025/2026' },
    { id: 'std_05', studentId: '10928375', name: 'Sarah Wijaya', classId: 'Kelas 9-C', parentsName: 'Hendra Wijaya', parentsEmail: 'hendra.w@example.com', parentsPhone: '081399001122', status: 'active', academicYear: '2025/2026' },
    { id: 'std_06', studentId: '10928376', name: 'Bagus Pratama', classId: 'Kelas 9-C', parentsName: 'Rudi Pratama', parentsEmail: 'rudi.p@example.com', parentsPhone: '081122334455', status: 'active', academicYear: '2025/2026' }
  ];

  for (const s of sampleStudents) {
    await query(
      `INSERT INTO students (id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.studentId, s.name, s.classId, s.parentsName, s.parentsEmail, s.parentsPhone, s.status, s.academicYear]
    );
  }

  const sampleEvents = [
    {
      id: 'evt_01',
      title: 'Pentas Seni & Kebudayaan Sekolah',
      description: 'Pentas seni tahunan komite sekolah untuk menumbuhkan minat seni siswa.',
      date: '2026-06-15',
      budgetTarget: 15000000,
      actualIncome: 12500000,
      actualExpense: 8500000,
      status: 'active'
    },
    {
      id: 'evt_02',
      title: 'Peringatan Hari Guru Nasional',
      description: 'Pemberian apresiasi kepada guru serta syukuran komite sekolah.',
      date: '2026-11-25',
      budgetTarget: 5000000,
      actualIncome: 3500000,
      actualExpense: 0,
      status: 'planning'
    },
    {
      id: 'evt_03',
      title: 'Renovasi Sanitasi & Toilet Kelas 7',
      description: 'Bantuan komite untuk perbaikan toilet dan fasilitas sanitasi kelas 7.',
      date: '2026-04-10',
      budgetTarget: 20000000,
      actualIncome: 20000000,
      actualExpense: 19500000,
      status: 'completed'
    }
  ];

  for (const e of sampleEvents) {
    await query(
      `INSERT INTO events (id, title, description, date, budget_target, actual_income, actual_expense, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [e.id, e.title, e.description, e.date, e.budgetTarget, e.actualIncome, e.actualExpense, e.status]
    );
  }

  const sampleTransactions = [
    { id: 'tx_01', date: '2026-05-02', type: 'income', category: 'Iuran Bulanan', amount: 150000, description: 'Pembayaran iuran bulanan Mei 2026 - Ahmad Fauzi (Kelas 7-A)', studentId: 'std_01', studentName: 'Ahmad Fauzi', classId: 'Kelas 7-A', period: 'Mei 2026', paymentMethod: 'Transfer Bank', recordedBy: 'operator@komite.id' },
    { id: 'tx_02', date: '2026-05-03', type: 'income', category: 'Iuran Bulanan', amount: 150000, description: 'Pembayaran iuran bulanan Mei 2026 - Siti Aminah (Kelas 7-A)', studentId: 'std_02', studentName: 'Siti Aminah', classId: 'Kelas 7-A', period: 'Mei 2026', paymentMethod: 'E-Wallet', recordedBy: 'operator@komite.id' },
    { id: 'tx_03', date: '2026-05-04', type: 'income', category: 'Sumbangan Acara', amount: 5000000, description: 'Sumbangan acara Pentas Seni dari Donatur Wali Murid', eventId: 'evt_01', paymentMethod: 'Transfer Bank', recordedBy: 'operator@komite.id' },
    { id: 'tx_04', date: '2026-05-08', type: 'income', category: 'Iuran Bulanan', amount: 150000, description: 'Pembayaran iuran bulanan Mei 2026 - Dewi Lestari (Kelas 8-B)', studentId: 'std_03', studentName: 'Dewi Lestari', classId: 'Kelas 8-B', period: 'Mei 2026', paymentMethod: 'Cash', recordedBy: 'operator@komite.id' },
    { id: 'tx_05', date: '2026-05-10', type: 'expense', category: 'Operasional', amount: 450000, description: 'Pembelian kertas kado, konsumsi rapat panitia bulanan', paymentMethod: 'Cash', recordedBy: 'operator@komite.id' },
    { id: 'tx_06', date: '2026-05-12', type: 'expense', category: 'Acara Sekolah', amount: 2500000, description: 'Uang muka (DP) sewa panggung Pentas Seni', eventId: 'evt_01', paymentMethod: 'Transfer Bank', recordedBy: 'operator@komite.id' },
    { id: 'tx_07', date: '2026-05-14', type: 'expense', category: 'Prasarana', amount: 19500000, description: 'Pembayaran borongan renovasi toilet kelas 7', eventId: 'evt_03', paymentMethod: 'Transfer Bank', recordedBy: 'operator@komite.id' }
  ];

  for (const tx of sampleTransactions) {
    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [tx.id, tx.date, tx.type, tx.category, tx.amount, tx.description, tx.studentId || null, tx.studentName || null, tx.classId || null, tx.period || null, tx.paymentMethod, tx.recordedBy, tx.eventId || null]
    );
  }

  const periods = ['April 2026', 'Mei 2026'];
  for (const student of sampleStudents) {
    for (const period of periods) {
      const isPaidInMayTx = (student.id === 'std_01' || student.id === 'std_02' || student.id === 'std_03') && period === 'Mei 2026';
      const isAlreadyPaidInApril = student.id !== 'std_04';

      const id = `${student.id}_${period.replace(' ', '_')}`;
      const amountRequired = 150000;
      let amountPaid = 0;
      let status = 'unpaid';

      if (period === 'Mei 2026' && isPaidInMayTx) {
        amountPaid = 150000;
        status = 'paid';
      } else if (period === 'April 2026' && isAlreadyPaidInApril) {
        amountPaid = 150000;
        status = 'paid';
      }

      await query(
        `INSERT INTO student_bills (id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [id, student.id, student.name, student.classId, student.parentsName, student.parentsPhone, student.parentsEmail, period, amountRequired, amountPaid, status, period === 'Mei 2026' ? '2026-05-20' : '2026-04-20']
      );
    }
  }

  console.log("✨ Initial seed data inserted into NeonDb PostgreSQL!");
}

// REST API ROUTES
app.get('/api/status', async (req, res) => {
  try {
    const { rows } = await query('SELECT current_database(), current_user');
    res.json({
      status: 'ok',
      provider: 'NeonDb PostgreSQL',
      connectedDb: rows[0]?.current_database || 'neondb',
      user: rows[0]?.current_user
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Seed endpoint
app.post('/api/seed', async (req, res) => {
  try {
    await seedInitialData();
    res.json({ success: true, message: "NeonDb PostgreSQL re-seeded successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// STUDENTS
app.get('/api/students', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM students ORDER BY name ASC');
    const students = rows.map(r => ({
      id: r.id,
      studentId: r.student_id,
      name: r.name,
      classId: r.class_id,
      parentsName: r.parents_name,
      parentsEmail: r.parents_email,
      parentsPhone: r.parents_phone,
      status: r.status,
      academicYear: r.academic_year
    }));
    res.json(students);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  const s = req.body;
  try {
    await query(
      `INSERT INTO students (id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         name = EXCLUDED.name,
         class_id = EXCLUDED.class_id,
         parents_name = EXCLUDED.parents_name,
         parents_email = EXCLUDED.parents_email,
         parents_phone = EXCLUDED.parents_phone,
         status = EXCLUDED.status,
         academic_year = EXCLUDED.academic_year`,
      [s.id, s.studentId, s.name, s.classId, s.parentsName, s.parentsEmail, s.parentsPhone, s.status || 'active', s.academicYear || '2025/2026']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    await query('DELETE FROM students WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// TRANSACTIONS
app.get('/api/transactions', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
    const transactions = rows.map(r => ({
      id: r.id,
      date: r.date,
      type: r.type,
      category: r.category,
      amount: Number(r.amount),
      description: r.description,
      studentId: r.student_id,
      studentName: r.student_name,
      classId: r.class_id,
      period: r.period,
      paymentMethod: r.payment_method,
      recordedBy: r.recorded_by,
      eventId: r.event_id,
      createdAt: r.created_at
    }));
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  const tx = req.body;
  try {
    await query(
      `INSERT INTO transactions (id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         type = EXCLUDED.type,
         category = EXCLUDED.category,
         amount = EXCLUDED.amount,
         description = EXCLUDED.description,
         student_id = EXCLUDED.student_id,
         student_name = EXCLUDED.student_name,
         class_id = EXCLUDED.class_id,
         period = EXCLUDED.period,
         payment_method = EXCLUDED.payment_method,
         recorded_by = EXCLUDED.recorded_by,
         event_id = EXCLUDED.event_id`,
      [tx.id, tx.date, tx.type, tx.category, tx.amount, tx.description, tx.studentId || null, tx.studentName || null, tx.classId || null, tx.period || null, tx.paymentMethod, tx.recordedBy, tx.eventId || null]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EVENTS
app.get('/api/events', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM events ORDER BY date DESC');
    const events = rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      date: r.date,
      budgetTarget: Number(r.budget_target),
      actualIncome: Number(r.actual_income),
      actualExpense: Number(r.actual_expense),
      status: r.status,
      createdAt: r.created_at
    }));
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  const e = req.body;
  try {
    await query(
      `INSERT INTO events (id, title, description, date, budget_target, actual_income, actual_expense, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         date = EXCLUDED.date,
         budget_target = EXCLUDED.budget_target,
         actual_income = EXCLUDED.actual_income,
         actual_expense = EXCLUDED.actual_expense,
         status = EXCLUDED.status`,
      [e.id, e.title, e.description, e.date, e.budgetTarget, e.actualIncome || 0, e.actualExpense || 0, e.status]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// STUDENT BILLS
app.get('/api/student_bills', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM student_bills ORDER BY period DESC, student_name ASC');
    const bills = rows.map(r => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      studentClass: r.student_class,
      parentsName: r.parents_name,
      parentsPhone: r.parents_phone,
      parentsEmail: r.parents_email,
      period: r.period,
      amountRequired: Number(r.amount_required),
      amountPaid: Number(r.amount_paid),
      status: r.status,
      dueDate: r.due_date,
      updatedAt: r.updated_at
    }));
    res.json(bills);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/student_bills', async (req, res) => {
  const b = req.body;
  try {
    await query(
      `INSERT INTO student_bills (id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         student_name = EXCLUDED.student_name,
         student_class = EXCLUDED.student_class,
         parents_name = EXCLUDED.parents_name,
         parents_phone = EXCLUDED.parents_phone,
         parents_email = EXCLUDED.parents_email,
         period = EXCLUDED.period,
         amount_required = EXCLUDED.amount_required,
         amount_paid = EXCLUDED.amount_paid,
         status = EXCLUDED.status,
         due_date = EXCLUDED.due_date,
         updated_at = CURRENT_TIMESTAMP`,
      [b.id, b.studentId, b.studentName, b.studentClass, b.parentsName, b.parentsPhone, b.parentsEmail, b.period, b.amountRequired, b.amountPaid, b.status, b.dueDate]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/student_bills/:id', async (req, res) => {
  try {
    await query('DELETE FROM student_bills WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CLASSES
app.get('/api/classes', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM classes ORDER BY name ASC');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classes', async (req, res) => {
  const { id, name } = req.body;
  try {
    await query('INSERT INTO classes (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [id || name, name]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/classes/:id', async (req, res) => {
  try {
    await query('DELETE FROM classes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// BATCH OPERATIONS ENDPOINT (for batch commits)
app.post('/api/batch', async (req, res) => {
  const { operations } = req.body; // array of { type: 'set'|'update'|'delete', collection: string, id: string, data?: any }
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: "Invalid operations payload" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const op of operations) {
      const { type, collection, id, data } = op;
      if (collection === 'students') {
        if (type === 'delete') {
          await client.query('DELETE FROM students WHERE id = $1', [id]);
        } else if (data) {
          await client.query(
            `INSERT INTO students (id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               student_id = EXCLUDED.student_id,
               name = EXCLUDED.name,
               class_id = EXCLUDED.class_id,
               parents_name = EXCLUDED.parents_name,
               parents_email = EXCLUDED.parents_email,
               parents_phone = EXCLUDED.parents_phone,
               status = EXCLUDED.status,
               academic_year = EXCLUDED.academic_year`,
            [id, data.studentId, data.name, data.classId, data.parentsName, data.parentsEmail, data.parentsPhone, data.status || 'active', data.academicYear || '2025/2026']
          );
        }
      } else if (collection === 'student_bills') {
        if (type === 'delete') {
          await client.query('DELETE FROM student_bills WHERE id = $1', [id]);
        } else if (data) {
          await client.query(
            `INSERT INTO student_bills (id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO UPDATE SET
               student_id = EXCLUDED.student_id,
               student_name = EXCLUDED.student_name,
               student_class = EXCLUDED.student_class,
               parents_name = EXCLUDED.parents_name,
               parents_phone = EXCLUDED.parents_phone,
               parents_email = EXCLUDED.parents_email,
               period = EXCLUDED.period,
               amount_required = EXCLUDED.amount_required,
               amount_paid = EXCLUDED.amount_paid,
               status = EXCLUDED.status,
               due_date = EXCLUDED.due_date,
               updated_at = CURRENT_TIMESTAMP`,
            [id, data.studentId, data.studentName, data.studentClass, data.parentsName, data.parentsPhone, data.parentsEmail, data.period, data.amountRequired, data.amountPaid, data.status, data.dueDate]
          );
        }
      } else if (collection === 'transactions') {
        if (type === 'delete') {
          await client.query('DELETE FROM transactions WHERE id = $1', [id]);
        } else if (data) {
          await client.query(
            `INSERT INTO transactions (id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO UPDATE SET
               date = EXCLUDED.date,
               type = EXCLUDED.type,
               category = EXCLUDED.category,
               amount = EXCLUDED.amount,
               description = EXCLUDED.description,
               student_id = EXCLUDED.student_id,
               student_name = EXCLUDED.student_name,
               class_id = EXCLUDED.class_id,
               period = EXCLUDED.period,
               payment_method = EXCLUDED.payment_method,
               recorded_by = EXCLUDED.recorded_by,
               event_id = EXCLUDED.event_id`,
            [id, data.date, data.type, data.category, data.amount, data.description, data.studentId || null, data.studentName || null, data.classId || null, data.period || null, data.paymentMethod, data.recordedBy, data.eventId || null]
          );
        }
      } else if (collection === 'events') {
        if (type === 'delete') {
          await client.query('DELETE FROM events WHERE id = $1', [id]);
        } else if (data) {
          await client.query(
            `INSERT INTO events (id, title, description, date, budget_target, actual_income, actual_expense, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               date = EXCLUDED.date,
               budget_target = EXCLUDED.budget_target,
               actual_income = EXCLUDED.actual_income,
               actual_expense = EXCLUDED.actual_expense,
               status = EXCLUDED.status`,
            [id, data.title, data.description, data.date, data.budgetTarget, data.actualIncome || 0, data.actualExpense || 0, data.status]
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, count: operations.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// START SERVER & VITE MIDDLEWARE
async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Full-stack server running on http://0.0.0.0:${PORT} with NeonDb PostgreSQL!`);
  });
}

startServer();
