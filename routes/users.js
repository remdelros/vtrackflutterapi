const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

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

// GET /api/v1/users - Get all users (admin only)
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('role_id').optional().isInt({ min: 1 }).withMessage('Invalid role ID'),
  query('team_id').optional().isInt({ min: 1 }).withMessage('Invalid team ID'),
  query('is_active').optional().isBoolean().withMessage('Is active must be boolean'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.team_id, 
             u.badge_number, u.phone, u.avatar, u.is_active, u.created_at, u.updated_at,
             r.name as role_name, r.description as role_description,
             t.name as team_name, l.name as location_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN teams t ON u.team_id = t.id
      LEFT JOIN locations l ON t.location_id = l.id
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE 1=1
    `;
    let params = [];
    let countParams = [];

    // Apply filters
    if (req.query.role_id) {
      query += ' AND u.role_id = ?';
      countQuery += ' AND u.role_id = ?';
      params.push(req.query.role_id);
      countParams.push(req.query.role_id);
    }

    if (req.query.team_id) {
      query += ' AND u.team_id = ?';
      countQuery += ' AND u.team_id = ?';
      params.push(req.query.team_id);
      countParams.push(req.query.team_id);
    }

    if (req.query.is_active !== undefined) {
      query += ' AND u.is_active = ?';
      countQuery += ' AND u.is_active = ?';
      params.push(req.query.is_active);
      countParams.push(req.query.is_active);
    }

    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [users, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, countParams)
    ]);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: users,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// GET /api/v1/users/:id - Get user by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can only view their own profile unless they're admin
    if (req.user.role_id !== 1 && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

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
      error: 'Failed to fetch user'
    });
  }
});

// PUT /api/v1/users/:id - Update user
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  body('first_name').optional().isString().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('last_name').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('team_id').optional().isInt({ min: 1 }).withMessage('Team ID must be a positive integer'),
  body('is_active').optional().isBoolean().withMessage('Is active must be boolean'),
  handleValidationErrors
], async (req, res) => {
  try {
    const userId = req.params.id;

    // Users can only update their own profile unless they're admin
    if (req.user.role_id !== 1 && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Only admins can update is_active and team_id
    if (req.user.role_id !== 1) {
      delete req.body.is_active;
      delete req.body.team_id;
    }

    const updateFields = [];
    const updateValues = [];

    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(req.body[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    // Check if team exists (if being updated)
    if (req.body.team_id) {
      const team = await executeQuery(
        'SELECT id FROM teams WHERE id = ?',
        [req.body.team_id]
      );

      if (!team.length) {
        return res.status(400).json({
          success: false,
          error: 'Invalid team ID'
        });
      }
    }

    updateValues.push(userId);
    const query = `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

// DELETE /api/v1/users/:id - Delete user (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent self-deletion
    if (req.user.id === parseInt(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    // Check if user exists
    const existingUser = await executeQuery(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (!existingUser.length) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user has violation records
    const violationRecords = await executeQuery(
      'SELECT id FROM violation_record WHERE apprehending_officer = ? LIMIT 1',
      [userId]
    );

    if (violationRecords.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete user with existing violation records'
      });
    }

    await executeQuery('DELETE FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

module.exports = router;
