const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// POST /api/v1/auth/login - User login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user with role information
    const user = await executeQuery(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, 
              u.role_id, u.team_id, u.badge_number, u.phone, u.avatar, u.is_active,
              r.name as role_name, r.description as role_description,
              t.name as team_name, l.name as location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN teams t ON u.team_id = t.id
       LEFT JOIN locations l ON t.location_id = l.id
       WHERE u.email = ?`,
      [email]
    );

    if (!user.length) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const userData = user[0];

    if (!userData.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userData.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: userData.id,
        email: userData.email,
        role: userData.role_name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Remove password from response
    delete userData.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// POST /api/v1/auth/register - Register new user (admin only)
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('first_name').isString().isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('last_name').isString().isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('role_id').isInt({ min: 1 }).withMessage('Valid role ID is required'),
  body('team_id').optional().isInt({ min: 1 }).withMessage('Team ID must be a positive integer'),
  body('badge_number').optional().isString().withMessage('Badge number must be a string'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      email, password, first_name, last_name, role_id, team_id, badge_number, phone
    } = req.body;

    // Check if email already exists
    const existingUser = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists'
      });
    }

    // Check if role exists
    const role = await executeQuery(
      'SELECT id FROM roles WHERE id = ?',
      [role_id]
    );

    if (!role.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role ID'
      });
    }

    // Check if team exists (if provided)
    if (team_id) {
      const team = await executeQuery(
        'SELECT id FROM teams WHERE id = ?',
        [team_id]
      );

      if (!team.length) {
        return res.status(400).json({
          success: false,
          error: 'Invalid team ID'
        });
      }
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await executeQuery(
      `INSERT INTO users (email, password_hash, first_name, last_name, role_id, team_id, badge_number, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, password_hash, first_name, last_name, role_id, team_id, badge_number, phone]
    );

    // Get created user with role information
    const newUser = await executeQuery(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.team_id, 
              u.badge_number, u.phone, u.avatar, u.is_active, u.created_at,
              r.name as role_name, r.description as role_description,
              t.name as team_name, l.name as location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN teams t ON u.team_id = t.id
       LEFT JOIN locations l ON t.location_id = l.id
       WHERE u.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: newUser[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// POST /api/v1/auth/change-password - Change password
router.post('/change-password', [
  body('current_password').isLength({ min: 6 }).withMessage('Current password is required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id; // From auth middleware

    // Get current password hash
    const user = await executeQuery(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, user[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 10;
    const new_password_hash = await bcrypt.hash(new_password, saltRounds);

    // Update password
    await executeQuery(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [new_password_hash, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// GET /api/v1/auth/profile - Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await executeQuery(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.team_id, 
              u.badge_number, u.phone, u.avatar, u.is_active, u.created_at, u.updated_at,
              r.name as role_name, r.description as role_description,
              t.name as team_name, l.name as location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN teams t ON u.team_id = t.id
       LEFT JOIN locations l ON t.location_id = l.id
       WHERE u.id = ?`,
      [userId]
    );

    if (!user.length) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

// PUT /api/v1/auth/profile - Update user profile
router.put('/profile', [
  body('first_name').optional().isString().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('last_name').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { first_name, last_name, phone } = req.body;

    const updateFields = [];
    const updateValues = [];

    if (first_name !== undefined) {
      updateFields.push('first_name = ?');
      updateValues.push(first_name);
    }

    if (last_name !== undefined) {
      updateFields.push('last_name = ?');
      updateValues.push(last_name);
    }

    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateValues.push(userId);
    const query = `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    // Get updated user profile
    const updatedUser = await executeQuery(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.team_id, 
              u.badge_number, u.phone, u.avatar, u.is_active, u.created_at, u.updated_at,
              r.name as role_name, r.description as role_description,
              t.name as team_name, l.name as location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN teams t ON u.team_id = t.id
       LEFT JOIN locations l ON t.location_id = l.id
       WHERE u.id = ?`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// GET /api/v1/auth/roles - Get all roles
router.get('/roles', async (req, res) => {
  try {
    const roles = await executeQuery(
      'SELECT id, name, description, created_at FROM roles ORDER BY name'
    );

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roles'
    });
  }
});

module.exports = router;
