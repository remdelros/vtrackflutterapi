const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { executeQuery, executeTransaction } = require('../config/database');
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

// GET /api/v1/violators - Get all violators with pagination and search
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, contact_no, drivers_license, first_name, last_name, 
             gender, address, age, date_of_birth, nationality, license_type,
             created_at, updated_at
      FROM violators
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM violators';
    let params = [];
    let countParams = [];

    if (search) {
      const searchCondition = `
        WHERE first_name LIKE ? OR last_name LIKE ? OR drivers_license LIKE ? OR contact_no LIKE ?
      `;
      query += searchCondition;
      countQuery += searchCondition;
      const searchParam = `%${search}%`;
      params = [searchParam, searchParam, searchParam, searchParam];
      countParams = [searchParam, searchParam, searchParam, searchParam];
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [violators, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, countParams)
    ]);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: violators,
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
      error: 'Failed to fetch violators'
    });
  }
});

// GET /api/v1/violators/:id - Get violator by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violator ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violator = await executeQuery(
      `SELECT id, contact_no, drivers_license, first_name, last_name, 
              gender, address, age, date_of_birth, nationality, license_type,
              created_at, updated_at
       FROM violators WHERE id = ?`,
      [req.params.id]
    );

    if (!violator.length) {
      return res.status(404).json({
        success: false,
        error: 'Violator not found'
      });
    }

    res.json({
      success: true,
      data: violator[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violator'
    });
  }
});

// POST /api/v1/violators - Create new violator
router.post('/', [
  body('contact_no').isString().isLength({ min: 10, max: 20 }).withMessage('Contact number must be 10-20 characters'),
  body('drivers_license').isString().isLength({ min: 1, max: 50 }).withMessage('Driver\'s license is required'),
  body('first_name').isString().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('last_name').isString().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
  body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('address').isString().isLength({ min: 1 }).withMessage('Address is required'),
  body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('date_of_birth').isISO8601().withMessage('Date of birth must be a valid date'),
  body('nationality').optional().isString().withMessage('Nationality must be a string'),
  body('license_type').optional().isString().withMessage('License type must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      contact_no, drivers_license, first_name, last_name, gender,
      address, age, date_of_birth, nationality, license_type
    } = req.body;

    // Check if driver's license already exists
    const existingViolator = await executeQuery(
      'SELECT id FROM violators WHERE drivers_license = ?',
      [drivers_license]
    );

    if (existingViolator.length) {
      return res.status(409).json({
        success: false,
        error: 'Driver\'s license already exists'
      });
    }

    const result = await executeQuery(
      `INSERT INTO violators (contact_no, drivers_license, first_name, last_name, 
                             gender, address, age, date_of_birth, nationality, license_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contact_no, drivers_license, first_name, last_name, gender, 
       address, age, date_of_birth, nationality, license_type]
    );

    res.status(201).json({
      success: true,
      message: 'Violator created successfully',
      data: {
        id: result.insertId,
        contact_no, drivers_license, first_name, last_name, gender,
        address, age, date_of_birth, nationality, license_type
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create violator'
    });
  }
});

// PUT /api/v1/violators/:id - Update violator
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violator ID'),
  body('contact_no').optional().isString().isLength({ min: 10, max: 20 }).withMessage('Contact number must be 10-20 characters'),
  body('drivers_license').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Driver\'s license is required'),
  body('first_name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('last_name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
  body('gender').optional().isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('address').optional().isString().isLength({ min: 1 }).withMessage('Address is required'),
  body('age').optional().isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120'),
  body('date_of_birth').optional().isISO8601().withMessage('Date of birth must be a valid date'),
  body('nationality').optional().isString().withMessage('Nationality must be a string'),
  body('license_type').optional().isString().withMessage('License type must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violatorId = req.params.id;
    const updateFields = [];
    const updateValues = [];

    // Build dynamic update query
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

    // Check if violator exists
    const existingViolator = await executeQuery(
      'SELECT id FROM violators WHERE id = ?',
      [violatorId]
    );

    if (!existingViolator.length) {
      return res.status(404).json({
        success: false,
        error: 'Violator not found'
      });
    }

    // Check for duplicate driver's license if being updated
    if (req.body.drivers_license) {
      const duplicateCheck = await executeQuery(
        'SELECT id FROM violators WHERE drivers_license = ? AND id != ?',
        [req.body.drivers_license, violatorId]
      );

      if (duplicateCheck.length) {
        return res.status(409).json({
          success: false,
          error: 'Driver\'s license already exists'
        });
      }
    }

    updateValues.push(violatorId);
    const query = `UPDATE violators SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    // Get updated violator
    const updatedViolator = await executeQuery(
      'SELECT * FROM violators WHERE id = ?',
      [violatorId]
    );

    res.json({
      success: true,
      message: 'Violator updated successfully',
      data: updatedViolator[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update violator'
    });
  }
});

// DELETE /api/v1/violators/:id - Delete violator (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violator ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const violatorId = req.params.id;

    // Check if violator exists
    const existingViolator = await executeQuery(
      'SELECT id FROM violators WHERE id = ?',
      [violatorId]
    );

    if (!existingViolator.length) {
      return res.status(404).json({
        success: false,
        error: 'Violator not found'
      });
    }

    // Check if violator has violation records
    const violationRecords = await executeQuery(
      'SELECT id FROM violation_record WHERE violator_id = ?',
      [violatorId]
    );

    if (violationRecords.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete violator with existing violation records'
      });
    }

    await executeQuery('DELETE FROM violators WHERE id = ?', [violatorId]);

    res.json({
      success: true,
      message: 'Violator deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete violator'
    });
  }
});

// GET /api/v1/violators/:id/violations - Get violator's violation records
router.get('/:id/violations', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violator ID'),
  query('status').optional().isIn(['Pending', 'Paid', 'Overdue', 'Cancelled']).withMessage('Invalid status'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violatorId = req.params.id;
    const status = req.query.status;

    let query = `
      SELECT vr.*, 
             CONCAT(v.first_name, ' ', v.last_name) as violator_name,
             CONCAT(u.first_name, ' ', u.last_name) as officer_name
      FROM violation_record vr
      JOIN violators v ON vr.violator_id = v.id
      JOIN users u ON vr.apprehending_officer = u.id
      WHERE vr.violator_id = ?
    `;
    let params = [violatorId];

    if (status) {
      query += ' AND vr.status = ?';
      params.push(status);
    }

    query += ' ORDER BY vr.created_at DESC';

    const violations = await executeQuery(query, params);

    res.json({
      success: true,
      data: violations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violator violations'
    });
  }
});

module.exports = router;
