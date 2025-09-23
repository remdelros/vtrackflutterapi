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

// GET /api/v1/violation-list - Get all violation types
router.get('/', [
  query('level').optional().isIn(['Minor', 'Major', 'Severe']).withMessage('Invalid level'),
  handleValidationErrors
], async (req, res) => {
  try {
    let query = 'SELECT * FROM violation_list WHERE 1=1';
    let params = [];

    if (req.query.level) {
      query += ' AND level = ?';
      params.push(req.query.level);
    }

    query += ' ORDER BY name';

    const violations = await executeQuery(query, params);

    res.json({
      success: true,
      data: violations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violation list'
    });
  }
});

// GET /api/v1/violation-list/:id - Get violation type by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violation = await executeQuery(
      'SELECT * FROM violation_list WHERE id = ?',
      [req.params.id]
    );

    if (!violation.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation not found'
      });
    }

    // Get penalty levels for this violation
    const penaltyLevels = await executeQuery(
      'SELECT * FROM violation_levels WHERE violation_list_id = ? ORDER BY offense_level',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...violation[0],
        penaltyLevels
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violation'
    });
  }
});

// POST /api/v1/violation-list - Create new violation type (admin only)
router.post('/', [
  body('name').isString().isLength({ min: 1, max: 255 }).withMessage('Name is required'),
  body('level').isIn(['Minor', 'Major', 'Severe']).withMessage('Level must be Minor, Major, or Severe'),
  body('penalty').isDecimal().withMessage('Penalty must be a decimal number'),
  body('description').optional().isString().withMessage('Description must be a string'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { name, level, penalty, description } = req.body;

    const result = await executeQuery(
      'INSERT INTO violation_list (name, level, penalty, description) VALUES (?, ?, ?, ?)',
      [name, level, penalty, description]
    );

    // Create penalty levels for all offense levels
    const penaltyLevels = [
      { offense_level: 'First Offense', penalty: parseFloat(penalty) },
      { offense_level: 'Second Offense', penalty: parseFloat(penalty) * 1.5 },
      { offense_level: 'Third Offense', penalty: parseFloat(penalty) * 2 }
    ];

    for (const level of penaltyLevels) {
      await executeQuery(
        'INSERT INTO violation_levels (violation_list_id, offense_level, penalty) VALUES (?, ?, ?)',
        [result.insertId, level.offense_level, level.penalty]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Violation type created successfully',
      data: {
        id: result.insertId,
        name, level, penalty, description
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create violation type'
    });
  }
});

// PUT /api/v1/violation-list/:id - Update violation type (admin only)
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation ID'),
  body('name').optional().isString().isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),
  body('level').optional().isIn(['Minor', 'Major', 'Severe']).withMessage('Level must be Minor, Major, or Severe'),
  body('penalty').optional().isDecimal().withMessage('Penalty must be a decimal number'),
  body('description').optional().isString().withMessage('Description must be a string'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const violationId = req.params.id;
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

    updateValues.push(violationId);
    const query = `UPDATE violation_list SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    res.json({
      success: true,
      message: 'Violation type updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update violation type'
    });
  }
});

// DELETE /api/v1/violation-list/:id - Delete violation type (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const violationId = req.params.id;

    // Check if violation is used in any records
    const usage = await executeQuery(
      'SELECT id FROM violation_junction WHERE violation_list_id = ? LIMIT 1',
      [violationId]
    );

    if (usage.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete violation type that is used in violation records'
      });
    }

    // Delete penalty levels first
    await executeQuery('DELETE FROM violation_levels WHERE violation_list_id = ?', [violationId]);
    
    // Delete violation type
    await executeQuery('DELETE FROM violation_list WHERE id = ?', [violationId]);

    res.json({
      success: true,
      message: 'Violation type deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete violation type'
    });
  }
});

module.exports = router;
