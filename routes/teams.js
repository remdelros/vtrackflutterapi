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

// GET /api/v1/teams - Get all teams
router.get('/', [
  query('location_id').optional().isInt({ min: 1 }).withMessage('Invalid location ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    let query = `
      SELECT t.*, l.name as location_name, l.street_address, l.zip_code
      FROM teams t
      LEFT JOIN locations l ON t.location_id = l.id
      WHERE 1=1
    `;
    let params = [];

    if (req.query.location_id) {
      query += ' AND t.location_id = ?';
      params.push(req.query.location_id);
    }

    query += ' ORDER BY t.name';

    const teams = await executeQuery(query, params);

    res.json({
      success: true,
      data: teams
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teams'
    });
  }
});

// GET /api/v1/teams/:id - Get team by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid team ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const team = await executeQuery(
      `SELECT t.*, l.name as location_name, l.street_address, l.zip_code
       FROM teams t
       LEFT JOIN locations l ON t.location_id = l.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (!team.length) {
      return res.status(404).json({
        success: false,
        error: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team'
    });
  }
});

// POST /api/v1/teams - Create new team (admin only)
router.post('/', [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('location_id').optional().isInt({ min: 1 }).withMessage('Location ID must be a positive integer'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { name, description, location_id } = req.body;

    // Check if location exists (if provided)
    if (location_id) {
      const location = await executeQuery(
        'SELECT id FROM locations WHERE id = ?',
        [location_id]
      );

      if (!location.length) {
        return res.status(400).json({
          success: false,
          error: 'Invalid location ID'
        });
      }
    }

    const result = await executeQuery(
      'INSERT INTO teams (name, description, location_id) VALUES (?, ?, ?)',
      [name, description, location_id]
    );

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: {
        id: result.insertId,
        name, description, location_id
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create team'
    });
  }
});

// PUT /api/v1/teams/:id - Update team (admin only)
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid team ID'),
  body('name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('location_id').optional().isInt({ min: 1 }).withMessage('Location ID must be a positive integer'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const teamId = req.params.id;
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

    // Check if location exists (if being updated)
    if (req.body.location_id) {
      const location = await executeQuery(
        'SELECT id FROM locations WHERE id = ?',
        [req.body.location_id]
      );

      if (!location.length) {
        return res.status(400).json({
          success: false,
          error: 'Invalid location ID'
        });
      }
    }

    updateValues.push(teamId);
    const query = `UPDATE teams SET ${updateFields.join(', ')}, created_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    res.json({
      success: true,
      message: 'Team updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update team'
    });
  }
});

// DELETE /api/v1/teams/:id - Delete team (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid team ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const teamId = req.params.id;

    // Check if team is used by users
    const users = await executeQuery(
      'SELECT id FROM users WHERE team_id = ? LIMIT 1',
      [teamId]
    );

    if (users.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete team that has assigned users'
      });
    }

    await executeQuery('DELETE FROM teams WHERE id = ?', [teamId]);

    res.json({
      success: true,
      message: 'Team deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete team'
    });
  }
});

module.exports = router;
