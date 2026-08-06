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

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

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
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        school_level VARCHAR(50) DEFAULT 'SMP',
        academic_year VARCHAR(50) DEFAULT '2025/2026',
        committee_chair VARCHAR(255),
        treasurer_name VARCHAR(255),
        principal_name VARCHAR(255),
        address TEXT,
        phone VARCHAR(100),
        email VARCHAR(255),
        monthly_dues_target NUMERIC DEFAULT 150000,
        logo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) DEFAULT 'demo_tenant',
        student_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        class_id VARCHAR(255) NOT NULL,
        parents_name VARCHAR(255),
        parents_email VARCHAR(255),
        parents_phone VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        academic_year VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) DEFAULT 'demo_tenant',
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
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) DEFAULT 'demo_tenant',
        date VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT,
        student_id VARCHAR(255),
        student_name VARCHAR(255),
        class_id VARCHAR(255),
        period VARCHAR(100),
        payment_method VARCHAR(100),
        recorded_by VARCHAR(255),
        event_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS student_bills (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) DEFAULT 'demo_tenant',
        student_id VARCHAR(255) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        student_class VARCHAR(255) NOT NULL,
        parents_name VARCHAR(255),
        parents_phone VARCHAR(255),
        parents_email VARCHAR(255),
        period VARCHAR(100) NOT NULL,
        amount_required NUMERIC DEFAULT 150000,
        amount_paid NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'unpaid',
        due_date VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS classes (
        id VARCHAR(255) PRIMARY KEY,
        tenant_id VARCHAR(255) DEFAULT 'demo_tenant',
        name VARCHAR(255) NOT NULL
      );
    `);

    // Ensure tenant_id columns exist if table was created earlier without it
    await query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'demo_tenant';
      ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'demo_tenant';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'demo_tenant';
      ALTER TABLE student_bills ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'demo_tenant';
      ALTER TABLE classes ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'demo_tenant';
    `);

    // Ensure default demo tenant exists
    await query(`
      INSERT INTO tenants (id, name, school_level, academic_year, committee_chair, treasurer_name, principal_name, address, email, monthly_dues_target)
      VALUES (
        'demo_tenant',
        'Sekolah Mandiri Komite',
        'SMP',
        '2025/2026',
        'Dr. H. Muhammad Ramli',
        'Sri Wahyuli, S.E',
        'Drs. Heru Wijayanto, M.Pd',
        'Jl. Pendidikan No. 45, Jakarta',
        'proto.sekolah.komite@gmail.com',
        150000
      ) ON CONFLICT (id) DO NOTHING;

      INSERT INTO users (id, tenant_id, email, password, name, role)
      VALUES (
        'usr_demo',
        'demo_tenant',
        'proto.sekolah.komite@gmail.com',
        'demo1234',
        'Bendahara Komite Percontohan',
        'admin'
      ) ON CONFLICT (id) DO NOTHING;

      INSERT INTO users (id, tenant_id, email, password, name, role)
      VALUES (
        'usr_dev',
        'demo_tenant',
        'dev@komiteku.id',
        'dev12345',
        'Developer / Tim Pengembang System',
        'admin'
      ) ON CONFLICT (id) DO NOTHING;
    `);

    // Check if initial seed is needed for demo tenant
    const { rows: existingStudents } = await query("SELECT COUNT(*) FROM students WHERE tenant_id = 'demo_tenant'");
    if (parseInt(existingStudents[0].count, 10) === 0) {
      console.log("🌱 Seeding initial demo data into NeonDb PostgreSQL...");
      await seedInitialData();
    } else {
      // Automatic cleanup for duplicate student entries in the same class
      try {
        await query(`
          DELETE FROM student_bills 
          WHERE id IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (
                PARTITION BY tenant_id, student_class, LOWER(TRIM(student_name)), period
                ORDER BY id ASC
              ) as rn
              FROM student_bills
            ) t WHERE t.rn > 1
          );

          DELETE FROM students 
          WHERE id IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (
                PARTITION BY tenant_id, class_id, LOWER(TRIM(name))
                ORDER BY id ASC
              ) as rn
              FROM students
            ) t WHERE t.rn > 1
          );
        `);
        console.log("✅ NeonDb PostgreSQL tables verified, active, and deduplicated.");
      } catch (dupErr) {
        console.warn("Deduplication notice:", dupErr);
      }
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

// Helper to extract active tenantId from request
function getReqTenantId(req: express.Request): string {
  const tenantId = (req.query.tenantId as string) || (req.headers['x-tenant-id'] as string) || 'demo_tenant';
  return tenantId.trim() || 'demo_tenant';
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

// AUTH: REGISTER
app.post('/api/auth/register', async (req, res) => {
  const { schoolName, schoolLevel, adminName, email, password } = req.body;
  if (!schoolName || !email || !password) {
    return res.status(400).json({ error: 'Nama sekolah, email, dan kata sandi wajib diisi' });
  }

  try {
    const tenantId = `tenant_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = `usr_${Date.now()}`;
    const level = schoolLevel || 'SMP';

    // 1. Create tenant
    await query(
      `INSERT INTO tenants (id, name, school_level, academic_year, committee_chair, treasurer_name, principal_name, address, email, monthly_dues_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        schoolName,
        level,
        '2025/2026',
        'Ketua Komite',
        adminName || 'Bendahara Komite',
        'Kepala Sekolah',
        'Alamat Sekolah',
        email,
        150000
      ]
    );

    // 2. Create user
    await query(
      `INSERT INTO users (id, tenant_id, email, password, name, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tenantId, email.toLowerCase(), password, adminName || 'Admin Komite', 'admin']
    );

    // 3. Create default classes based on school level
    let defaultClassNames = ['Kelas 7-A', 'Kelas 8-A', 'Kelas 9-A'];
    if (level === 'SD') defaultClassNames = ['Kelas 1-A', 'Kelas 2-A', 'Kelas 3-A', 'Kelas 4-A', 'Kelas 5-A', 'Kelas 6-A'];
    if (level === 'SMA' || level === 'SMK') defaultClassNames = ['Kelas 10-A', 'Kelas 11-A', 'Kelas 12-A'];

    for (const cName of defaultClassNames) {
      await query(
        `INSERT INTO classes (id, tenant_id, name) VALUES ($1, $2, $3)`,
        [`cls_${tenantId}_${cName.replace(/\s+/g, '_')}`, tenantId, cName]
      );
    }

    const tenantRes = await query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    const tenantObj = tenantRes.rows[0];

    res.json({
      success: true,
      user: { id: userId, email, name: adminName || 'Admin Komite', role: 'admin', tenantId },
      tenant: {
        id: tenantObj.id,
        name: tenantObj.name,
        schoolLevel: tenantObj.school_level,
        academicYear: tenantObj.academic_year,
        committeeChair: tenantObj.committee_chair,
        treasurerName: tenantObj.treasurer_name,
        principalName: tenantObj.principal_name,
        address: tenantObj.address,
        monthlyDuesTarget: Number(tenantObj.monthly_dues_target)
      }
    });
  } catch (err: any) {
    if (err.message?.includes('users_email_key') || err.code === '23505') {
      return res.status(400).json({ error: 'Email tersebut sudah terdaftar' });
    }
    res.status(500).json({ error: err.message });
  }
});

// AUTH: LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email wajib diisi' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (userRes.rows.length === 0) {
      // Demo fallback if login with default email
      if (email.toLowerCase() === 'proto.sekolah.komite@gmail.com' || email.toLowerCase() === 'demo@komite.id') {
        const tenantRes = await query("SELECT * FROM tenants WHERE id = 'demo_tenant'");
        const t = tenantRes.rows[0];
        return res.json({
          success: true,
          user: { id: 'usr_demo', email, name: 'Bendahara Komite Percontohan', role: 'admin', tenantId: 'demo_tenant' },
          tenant: {
            id: t.id,
            name: t.name,
            schoolLevel: t.school_level,
            academicYear: t.academic_year,
            committeeChair: t.committee_chair,
            treasurerName: t.treasurer_name,
            principalName: t.principal_name,
            address: t.address,
            monthlyDuesTarget: Number(t.monthly_dues_target)
          }
        });
      }
      return res.status(401).json({ error: 'Email atau kata sandi tidak ditemukan' });
    }

    const u = userRes.rows[0];
    if (password && u.password !== password) {
      return res.status(401).json({ error: 'Kata sandi tidak sesuai' });
    }

    const tenantRes = await query('SELECT * FROM tenants WHERE id = $1', [u.tenant_id]);
    const t = tenantRes.rows[0] || {};

    res.json({
      success: true,
      user: { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenant_id },
      tenant: {
        id: t.id || u.tenant_id,
        name: t.name || 'Sekolah Komite',
        schoolLevel: t.school_level || 'SMP',
        academicYear: t.academic_year || '2025/2026',
        committeeChair: t.committee_chair,
        treasurerName: t.treasurer_name,
        principalName: t.principal_name,
        address: t.address,
        monthlyDuesTarget: Number(t.monthly_dues_target || 150000)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// TENANT PROFILE GET/POST
app.get('/api/tenants/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tenant tidak ditemukan' });
    }
    const t = rows[0];
    res.json({
      id: t.id,
      name: t.name,
      schoolLevel: t.school_level,
      academicYear: t.academic_year,
      committeeChair: t.committee_chair,
      treasurerName: t.treasurer_name,
      principalName: t.principal_name,
      address: t.address,
      phone: t.phone,
      email: t.email,
      monthlyDuesTarget: Number(t.monthly_dues_target),
      logoUrl: t.logo_url
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenants/:id', async (req, res) => {
  const tenantId = req.params.id;
  const t = req.body;
  try {
    await query(
      `INSERT INTO tenants (id, name, school_level, academic_year, committee_chair, treasurer_name, principal_name, address, phone, email, monthly_dues_target, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         school_level = EXCLUDED.school_level,
         academic_year = EXCLUDED.academic_year,
         committee_chair = EXCLUDED.committee_chair,
         treasurer_name = EXCLUDED.treasurer_name,
         principal_name = EXCLUDED.principal_name,
         address = EXCLUDED.address,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         monthly_dues_target = EXCLUDED.monthly_dues_target,
         logo_url = EXCLUDED.logo_url`,
      [
        tenantId,
        t.name || 'Sekolah Komite',
        t.schoolLevel || 'SMP',
        t.academicYear || '2025/2026',
        t.committeeChair || '',
        t.treasurerName || '',
        t.principalName || '',
        t.address || '',
        t.phone || '',
        t.email || '',
        t.monthlyDuesTarget || 150000,
        t.logoUrl || ''
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// BACKUP & RESTORE TENANT DATA
app.get('/api/backup/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;
  try {
    const tenantRes = await query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    const studentsRes = await query('SELECT * FROM students WHERE tenant_id = $1', [tenantId]);
    const eventsRes = await query('SELECT * FROM events WHERE tenant_id = $1', [tenantId]);
    const txRes = await query('SELECT * FROM transactions WHERE tenant_id = $1', [tenantId]);
    const billsRes = await query('SELECT * FROM student_bills WHERE tenant_id = $1', [tenantId]);
    const classesRes = await query('SELECT * FROM classes WHERE tenant_id = $1', [tenantId]);

    const backupData = {
      version: 'v2.5-multi-tenant',
      exportedAt: new Date().toISOString(),
      tenantId,
      tenant: tenantRes.rows[0] || null,
      students: studentsRes.rows,
      events: eventsRes.rows,
      transactions: txRes.rows,
      student_bills: billsRes.rows,
      classes: classesRes.rows
    };

    res.json(backupData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;
  const payload = req.body; // backup JSON
  if (!payload || !payload.students) {
    return res.status(400).json({ error: 'Format berkas cadangan (backup JSON) tidak valid' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing records for this tenant
    await client.query('DELETE FROM student_bills WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM transactions WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM students WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM classes WHERE tenant_id = $1', [tenantId]);

    // Restore classes
    if (Array.isArray(payload.classes)) {
      for (const c of payload.classes) {
        await client.query('INSERT INTO classes (id, tenant_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [c.id || `cls_${Date.now()}`, tenantId, c.name]);
      }
    }

    // Restore students
    if (Array.isArray(payload.students)) {
      for (const s of payload.students) {
        await client.query(
          `INSERT INTO students (id, tenant_id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
          [s.id || `std_${Date.now()}`, tenantId, s.student_id || s.studentId || '', s.name, s.class_id || s.classId || '', s.parents_name || s.parentsName || '', s.parents_email || s.parentsEmail || '', s.parents_phone || s.parentsPhone || '', s.status || 'active', s.academic_year || s.academicYear || '2025/2026']
        );
      }
    }

    // Restore events
    if (Array.isArray(payload.events)) {
      for (const e of payload.events) {
        await client.query(
          `INSERT INTO events (id, tenant_id, title, description, date, budget_target, actual_income, actual_expense, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
          [e.id || `evt_${Date.now()}`, tenantId, e.title, e.description, e.date, e.budget_target || e.budgetTarget || 0, e.actual_income || e.actualIncome || 0, e.actual_expense || e.actualExpense || 0, e.status || 'active']
        );
      }
    }

    // Restore transactions
    if (Array.isArray(payload.transactions)) {
      for (const tx of payload.transactions) {
        await client.query(
          `INSERT INTO transactions (id, tenant_id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT DO NOTHING`,
          [tx.id || `tx_${Date.now()}`, tenantId, tx.date, tx.type, tx.category, tx.amount, tx.description, tx.student_id || tx.studentId || null, tx.student_name || tx.studentName || null, tx.class_id || tx.classId || null, tx.period || null, tx.payment_method || tx.paymentMethod || 'Cash', tx.recorded_by || tx.recordedBy || 'Operator', tx.event_id || tx.eventId || null]
        );
      }
    }

    // Restore student_bills
    if (Array.isArray(payload.student_bills)) {
      for (const b of payload.student_bills) {
        await client.query(
          `INSERT INTO student_bills (id, tenant_id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING`,
          [b.id || `bill_${Date.now()}`, tenantId, b.student_id || b.studentId || '', b.student_name || b.studentName || '', b.student_class || b.studentClass || '', b.parents_name || b.parentsName || '', b.parents_phone || b.parentsPhone || '', b.parents_email || b.parentsEmail || '', b.period || 'Period', b.amount_required || b.amountRequired || 150000, b.amount_paid || b.amountPaid || 0, b.status || 'unpaid', b.due_date || b.dueDate || '2026-05-20']
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Restore data berhasil disimpan.' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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

// STUDENTS (MULTI-TENANT)
app.get('/api/students', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    const { rows } = await query('SELECT * FROM students WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
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
  const tenantId = getReqTenantId(req);
  const s = req.body;
  try {
    await query(
      `INSERT INTO students (id, tenant_id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         name = EXCLUDED.name,
         class_id = EXCLUDED.class_id,
         parents_name = EXCLUDED.parents_name,
         parents_email = EXCLUDED.parents_email,
         parents_phone = EXCLUDED.parents_phone,
         status = EXCLUDED.status,
         academic_year = EXCLUDED.academic_year`,
      [s.id, tenantId, s.studentId, s.name, s.classId, s.parentsName, s.parentsEmail, s.parentsPhone, s.status || 'active', s.academicYear || '2025/2026']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    await query('DELETE FROM students WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// TRANSACTIONS (MULTI-TENANT)
app.get('/api/transactions', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    const { rows } = await query('SELECT * FROM transactions WHERE tenant_id = $1 ORDER BY date DESC, created_at DESC', [tenantId]);
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
  const tenantId = getReqTenantId(req);
  const tx = req.body;
  try {
    await query(
      `INSERT INTO transactions (id, tenant_id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      [tx.id, tenantId, tx.date, tx.type, tx.category, tx.amount, tx.description, tx.studentId || null, tx.studentName || null, tx.classId || null, tx.period || null, tx.paymentMethod, tx.recordedBy, tx.eventId || null]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    await query('DELETE FROM transactions WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EVENTS (MULTI-TENANT)
app.get('/api/events', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    const { rows } = await query('SELECT * FROM events WHERE tenant_id = $1 ORDER BY date DESC', [tenantId]);
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
  const tenantId = getReqTenantId(req);
  const e = req.body;
  try {
    await query(
      `INSERT INTO events (id, tenant_id, title, description, date, budget_target, actual_income, actual_expense, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         date = EXCLUDED.date,
         budget_target = EXCLUDED.budget_target,
         actual_income = EXCLUDED.actual_income,
         actual_expense = EXCLUDED.actual_expense,
         status = EXCLUDED.status`,
      [e.id, tenantId, e.title, e.description, e.date, e.budgetTarget, e.actualIncome || 0, e.actualExpense || 0, e.status]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    await query('DELETE FROM events WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// STUDENT BILLS (MULTI-TENANT)
app.get('/api/student_bills', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    const { rows } = await query('SELECT * FROM student_bills WHERE tenant_id = $1 ORDER BY period DESC, student_name ASC', [tenantId]);
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
  const tenantId = getReqTenantId(req);
  const b = req.body;
  try {
    await query(
      `INSERT INTO student_bills (id, tenant_id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
      [b.id, tenantId, b.studentId, b.studentName, b.studentClass, b.parentsName, b.parentsPhone, b.parentsEmail, b.period, b.amountRequired, b.amountPaid, b.status, b.dueDate]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/student_bills/:id', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    await query('DELETE FROM student_bills WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CLASSES (MULTI-TENANT)
app.get('/api/classes', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    const { rows } = await query('SELECT * FROM classes WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classes', async (req, res) => {
  const tenantId = getReqTenantId(req);
  const { id, name } = req.body;
  try {
    await query(
      'INSERT INTO classes (id, tenant_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
      [id || `cls_${tenantId}_${name.replace(/\s+/g, '_')}`, tenantId, name]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/classes/:id', async (req, res) => {
  const tenantId = getReqTenantId(req);
  try {
    await query('DELETE FROM classes WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// BATCH OPERATIONS ENDPOINT (for batch commits)
app.post('/api/batch', async (req, res) => {
  const tenantId = getReqTenantId(req);
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
          await client.query('DELETE FROM students WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        } else if (data) {
          await client.query(
            `INSERT INTO students (id, tenant_id, student_id, name, class_id, parents_name, parents_email, parents_phone, status, academic_year)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               student_id = EXCLUDED.student_id,
               name = EXCLUDED.name,
               class_id = EXCLUDED.class_id,
               parents_name = EXCLUDED.parents_name,
               parents_email = EXCLUDED.parents_email,
               parents_phone = EXCLUDED.parents_phone,
               status = EXCLUDED.status,
               academic_year = EXCLUDED.academic_year`,
            [
              id, 
              tenantId,
              data.studentId || '', 
              data.name || 'Siswa', 
              data.classId || 'Unassigned', 
              data.parentsName || 'Wali Murid', 
              data.parentsEmail || '', 
              data.parentsPhone || '', 
              data.status || 'active', 
              data.academicYear || '2025/2026'
            ]
          );
        }
      } else if (collection === 'student_bills') {
        if (type === 'delete') {
          await client.query('DELETE FROM student_bills WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        } else if (data) {
          await client.query(
            `INSERT INTO student_bills (id, tenant_id, student_id, student_name, student_class, parents_name, parents_phone, parents_email, period, amount_required, amount_paid, status, due_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
            [
              id, 
              tenantId,
              data.studentId || '', 
              data.studentName || 'Siswa', 
              data.studentClass || 'Unassigned', 
              data.parentsName || '', 
              data.parentsPhone || '', 
              data.parentsEmail || '', 
              data.period || 'Periode', 
              data.amountRequired !== undefined && data.amountRequired !== null ? Number(data.amountRequired) : 150000, 
              data.amountPaid !== undefined && data.amountPaid !== null ? Number(data.amountPaid) : 0, 
              data.status || 'unpaid', 
              data.dueDate || '2026-05-20'
            ]
          );
        }
      } else if (collection === 'transactions') {
        if (type === 'delete') {
          await client.query('DELETE FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        } else if (data) {
          await client.query(
            `INSERT INTO transactions (id, tenant_id, date, type, category, amount, description, student_id, student_name, class_id, period, payment_method, recorded_by, event_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            [id, tenantId, data.date, data.type, data.category, data.amount, data.description, data.studentId || null, data.studentName || null, data.classId || null, data.period || null, data.paymentMethod, data.recordedBy, data.eventId || null]
          );
        }
      } else if (collection === 'events') {
        if (type === 'delete') {
          await client.query('DELETE FROM events WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        } else if (data) {
          await client.query(
            `INSERT INTO events (id, tenant_id, title, description, date, budget_target, actual_income, actual_expense, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               date = EXCLUDED.date,
               budget_target = EXCLUDED.budget_target,
               actual_income = EXCLUDED.actual_income,
               actual_expense = EXCLUDED.actual_expense,
               status = EXCLUDED.status`,
            [id, tenantId, data.title, data.description, data.date, data.budgetTarget, data.actualIncome || 0, data.actualExpense || 0, data.status]
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

// PWA Icon & Manifest Endpoints
app.get(['/pwa-192x192.png', '/pwa-512x512.png', '/favicon.ico'], (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#059669" />
          <stop offset="100%" stop-color="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="url(#bg)" />
      <path d="M256 110 L400 190 L112 190 Z" fill="#ffffff" />
      <rect x="152" y="210" width="32" height="130" rx="6" fill="#ffffff" />
      <rect x="240" y="210" width="32" height="130" rx="6" fill="#ffffff" />
      <rect x="328" y="210" width="32" height="130" rx="6" fill="#ffffff" />
      <rect x="120" y="356" width="272" height="36" rx="8" fill="#ffffff" />
      <text x="256" y="440" font-family="Ubuntu, sans-serif" font-size="44" font-weight="bold" fill="#ffffff" text-anchor="middle">KomiteKu</text>
    </svg>
  `.trim());
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(process.cwd(), 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
});

// START SERVER & VITE MIDDLEWARE
async function startServer() {
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

  // Run DB initialization in background without blocking server boot
  initDb().catch(err => {
    console.error("❌ Background DB init error:", err);
  });
}

startServer();
