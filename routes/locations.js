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

// GET /api/v1/locations - Get all locations
router.get('/', async (req, res) => {
  try {
    const locations = await executeQuery(
      'SELECT * FROM locations ORDER BY name'
    );

    res.json({
      success: true,
      data: locations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations'
    });
  }
});

// GET /api/v1/locations/:id - Get location by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid location ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const location = await executeQuery(
      'SELECT * FROM locations WHERE id = ?',
      [req.params.id]
    );

    if (!location.length) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      data: location[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location'
    });
  }
});

// POST /api/v1/locations - Create new location (admin only)
router.post('/', [
  body('name').isString().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
  body('street_address').optional().isString().withMessage('Street address must be a string'),
  body('zip_code').optional().isString().withMessage('Zip code must be a string'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const { name, street_address, zip_code } = req.body;

    const result = await executeQuery(
      'INSERT INTO locations (name, street_address, zip_code) VALUES (?, ?, ?)',
      [name, street_address, zip_code]
    );

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: {
        id: result.insertId,
        name, street_address, zip_code
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create location'
    });
  }
});

// PUT /api/v1/locations/:id - Update location (admin only)
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid location ID'),
  body('name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('street_address').optional().isString().withMessage('Street address must be a string'),
  body('zip_code').optional().isString().withMessage('Zip code must be a string'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const locationId = req.params.id;
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

    updateValues.push(locationId);
    const query = `UPDATE locations SET ${updateFields.join(', ')}, created_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update location'
    });
  }
});

// DELETE /api/v1/locations/:id - Delete location (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid location ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const locationId = req.params.id;

    // Check if location is used by teams
    const teams = await executeQuery(
      'SELECT id FROM teams WHERE location_id = ? LIMIT 1',
      [locationId]
    );

    if (teams.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete location that is used by teams'
      });
    }

    await executeQuery('DELETE FROM locations WHERE id = ?', [locationId]);

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete location'
    });
  }
});

module.exports = router;
