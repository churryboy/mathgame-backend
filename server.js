const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create tables if they don't exist
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        grade INTEGER NOT NULL,
        school_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        best_score INTEGER DEFAULT 0,
        best_stage INTEGER DEFAULT 1,
        play_count INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        total_answers INTEGER DEFAULT 0,
        tier VARCHAR(20) DEFAULT '브론즈',
        grade_rank INTEGER DEFAULT 0,
        last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        grade_history JSONB DEFAULT '{}',
        UNIQUE(user_id)
      )
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database on startup
initDatabase();

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Math Game Backend API' });
});

// Register new user
app.post('/api/register', async (req, res) => {
  const { username, password, grade, schoolName } = req.body;

  try {
    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const newUser = await pool.query(
      'INSERT INTO users (username, password, grade, school_name) VALUES ($1, $2, $3, $4) RETURNING id, username, grade, school_name',
      [username, hashedPassword, grade, schoolName]
    );

    // Create initial stats
    await pool.query(
      'INSERT INTO user_stats (user_id) VALUES ($1)',
      [newUser.rows[0].id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.rows[0].id, username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      user: newUser.rows[0],
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Get user
    const userResult = await pool.query(
      'SELECT id, username, password, grade, school_name FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user stats
    const statsResult = await pool.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        grade: user.grade,
        schoolName: user.school_name,
        stats: statsResult.rows[0] || {}
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Update user stats
app.post('/api/stats/update', async (req, res) => {
  const { username, stats } = req.body;

  try {
    // Get user ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Update stats
    await pool.query(`
      INSERT INTO user_stats (user_id, best_score, best_stage, play_count, correct_answers, total_answers, tier, grade_rank, last_played, grade_history)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9)
      ON CONFLICT (user_id) 
      DO UPDATE SET
        best_score = GREATEST(user_stats.best_score, EXCLUDED.best_score),
        best_stage = GREATEST(user_stats.best_stage, EXCLUDED.best_stage),
        play_count = user_stats.play_count + 1,
        correct_answers = EXCLUDED.correct_answers,
        total_answers = EXCLUDED.total_answers,
        tier = EXCLUDED.tier,
        grade_rank = EXCLUDED.grade_rank,
        last_played = CURRENT_TIMESTAMP,
        grade_history = EXCLUDED.grade_history
    `, [
      userId,
      stats.bestScore || 0,
      stats.bestStage || 1,
      stats.playCount || 0,
      stats.correctAnswers || 0,
      stats.totalAnswers || 0,
      stats.tier || '브론즈',
      stats.gradeRank || 0,
      JSON.stringify(stats.gradeHistory || {})
    ]);

    res.json({ success: true, message: 'Stats updated successfully' });
  } catch (error) {
    console.error('Stats update error:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// Get leaderboard - all grades
app.get('/api/leaderboard', async (req, res) => {
  try {
    const query = `
      SELECT 
        u.username, 
        u.grade, 
        u.school_name,
        s.best_score,
        s.best_stage,
        s.tier,
        s.correct_answers,
        s.total_answers,
        s.last_played
      FROM users u
      JOIN user_stats s ON u.id = s.user_id
      ORDER BY s.best_score DESC, s.best_stage DESC LIMIT 100
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      leaderboard: result.rows
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get leaderboard - specific grade
app.get('/api/leaderboard/:grade', async (req, res) => {
  const { grade } = req.params;

  try {
    const query = `
      SELECT 
        u.username, 
        u.grade, 
        u.school_name,
        s.best_score,
        s.best_stage,
        s.tier,
        s.correct_answers,
        s.total_answers,
        s.last_played
      FROM users u
      JOIN user_stats s ON u.id = s.user_id
      WHERE u.grade = $1
      ORDER BY s.best_score DESC, s.best_stage DESC LIMIT 100
    `;

    const result = await pool.query(query, [grade]);

    res.json({
      success: true,
      leaderboard: result.rows
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get all users (for compatibility with existing code)
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.username,
        u.password,
        u.grade,
        u.school_name as "schoolName",
        s.best_score as "bestScore",
        s.best_stage as "bestStage",
        s.play_count as "playCount",
        s.correct_answers as "correctAnswers",
        s.total_answers as "totalAnswers",
        s.tier,
        s.grade_rank as "gradeRank",
        s.last_played as "lastPlayed",
        s.grade_history as "gradeHistory",
        u.created_at as "createdAt"
      FROM users u
      LEFT JOIN user_stats s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `);

    const users = result.rows.map(row => ({
      username: row.username,
      password: row.password,
      grade: row.grade,
      schoolName: row.schoolName,
      stats: {
        bestScore: row.bestScore || 0,
        bestStage: row.bestStage || 1,
        playCount: row.playCount || 0,
        correctAnswers: row.correctAnswers || 0,
        totalAnswers: row.totalAnswers || 0,
        tier: row.tier || '브론즈',
        gradeRank: row.gradeRank || 0,
        lastPlayed: row.lastPlayed,
        gradeHistory: row.gradeHistory || {}
      },
      createdAt: row.createdAt
    }));

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
