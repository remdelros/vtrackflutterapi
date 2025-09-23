const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, param, query, validationResult } = require('express-validator');
const { executeQuery, executeTransaction } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and documents are allowed'));
    }
  }
});

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

// GET /api/v1/violation-records - Get all violation records with pagination and filters
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['Pending', 'Paid', 'Overdue', 'Cancelled']).withMessage('Invalid status'),
  query('violator_id').optional().isInt({ min: 1 }).withMessage('Invalid violator ID'),
  query('officer_id').optional().isInt({ min: 1 }).withMessage('Invalid officer ID'),
  query('date_from').optional().isISO8601().withMessage('Invalid date format'),
  query('date_to').optional().isISO8601().withMessage('Invalid date format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = `
      SELECT vr.*, 
             CONCAT(v.first_name, ' ', v.last_name) as violator_name,
             v.contact_no as violator_contact,
             v.drivers_license,
             CONCAT(u.first_name, ' ', u.last_name) as officer_name,
             u.badge_number
      FROM violation_record vr
      JOIN violators v ON vr.violator_id = v.id
      JOIN users u ON vr.apprehending_officer = u.id
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) as total
      FROM violation_record vr
      JOIN violators v ON vr.violator_id = v.id
      JOIN users u ON vr.apprehending_officer = u.id
      WHERE 1=1
    `;
    let params = [];

    // Apply filters
    if (req.query.status) {
      query += ' AND vr.status = ?';
      countQuery += ' AND vr.status = ?';
      params.push(req.query.status);
    }

    if (req.query.violator_id) {
      query += ' AND vr.violator_id = ?';
      countQuery += ' AND vr.violator_id = ?';
      params.push(req.query.violator_id);
    }

    if (req.query.officer_id) {
      query += ' AND vr.apprehending_officer = ?';
      countQuery += ' AND vr.apprehending_officer = ?';
      params.push(req.query.officer_id);
    }

    if (req.query.date_from) {
      query += ' AND vr.date >= ?';
      countQuery += ' AND vr.date >= ?';
      params.push(req.query.date_from);
    }

    if (req.query.date_to) {
      query += ' AND vr.date <= ?';
      countQuery += ' AND vr.date <= ?';
      params.push(req.query.date_to);
    }

    query += ' ORDER BY vr.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [violationRecords, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, params.slice(0, -2))
    ]);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: violationRecords,
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
      error: 'Failed to fetch violation records'
    });
  }
});

// GET /api/v1/violation-records/:id - Get violation record by ID with details
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation record ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violationRecord = await executeQuery(
      `SELECT vr.*, 
              CONCAT(v.first_name, ' ', v.last_name) as violator_name,
              v.contact_no as violator_contact,
              v.drivers_license, v.gender, v.age, v.address,
              CONCAT(u.first_name, ' ', u.last_name) as officer_name,
              u.badge_number
       FROM violation_record vr
       JOIN violators v ON vr.violator_id = v.id
       JOIN users u ON vr.apprehending_officer = u.id
       WHERE vr.id = ?`,
      [req.params.id]
    );

    if (!violationRecord.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation record not found'
      });
    }

    // Get violation details
    const violationDetails = await executeQuery(
      `SELECT vj.*, vl.name as violation_name, vl.level as violation_level
       FROM violation_junction vj
       JOIN violation_list vl ON vj.violation_list_id = vl.id
       WHERE vj.violation_record_id = ?`,
      [req.params.id]
    );

    // Get payment information if exists
    const payment = await executeQuery(
      `SELECT p.*, CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
       FROM payments p
       LEFT JOIN users u ON p.processed_by = u.id
       WHERE p.violation_record_id = ?`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...violationRecord[0],
        violations: violationDetails,
        payment: payment[0] || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violation record'
    });
  }
});

// POST /api/v1/violation-records - Create new violation record
router.post('/', upload.array('evidences', 10), [
  body('violator_id').isInt({ min: 1 }).withMessage('Valid violator ID is required'),
  body('location').isString().isLength({ min: 1 }).withMessage('Location is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('violations').isArray({ min: 1 }).withMessage('At least one violation is required'),
  body('violations.*.violation_list_id').isInt({ min: 1 }).withMessage('Valid violation list ID is required'),
  body('violations.*.offense_level').isIn(['First Offense', 'Second Offense', 'Third Offense']).withMessage('Invalid offense level'),
  body('officers_note').optional().isString().withMessage('Officer\'s note must be a string'),
  body('confiscated').optional().isString().withMessage('Confiscated items must be a string'),
  body('plate_no').optional().isString().withMessage('Plate number must be a string'),
  body('or_number').optional().isString().withMessage('OR number must be a string'),
  body('cr_number').optional().isString().withMessage('CR number must be a string'),
  body('is_accident').optional().isBoolean().withMessage('Is accident must be boolean'),
  body('permit').optional().isString().withMessage('Permit must be a string'),
  body('vehicle_plate_no').optional().isString().withMessage('Vehicle plate number must be a string'),
  body('year').optional().isString().withMessage('Year must be a string'),
  body('vehicle_make').optional().isString().withMessage('Vehicle make must be a string'),
  body('body').optional().isString().withMessage('Body must be a string'),
  body('color').optional().isString().withMessage('Color must be a string'),
  body('registered_owner').optional().isString().withMessage('Registered owner must be a string'),
  body('registered_owner_address').optional().isString().withMessage('Registered owner address must be a string'),
  body('vehicle_place_issued').optional().isString().withMessage('Vehicle place issued must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      violator_id, location, date, violations, officers_note, confiscated,
      plate_no, or_number, cr_number, is_accident, permit, vehicle_plate_no,
      year, vehicle_make, body, color, registered_owner, registered_owner_address,
      vehicle_place_issued
    } = req.body;

    // Check if violator exists
    const violator = await executeQuery(
      'SELECT id FROM violators WHERE id = ?',
      [violator_id]
    );

    if (!violator.length) {
      return res.status(404).json({
        success: false,
        error: 'Violator not found'
      });
    }

    // Process evidence files
    let evidences = [];
    if (req.files && req.files.length > 0) {
      evidences = req.files.map(file => ({
        original_name: file.originalname,
        file_name: file.filename,
        file_path: file.path,
        file_type: file.mimetype,
        file_size: file.size,
        upload_date: new Date().toISOString()
      }));
    }

    // Calculate total amount
    let totalAmount = 0;
    const violationDetails = [];

    for (const violation of violations) {
      const penalty = await executeQuery(
        'SELECT penalty FROM violation_levels WHERE violation_list_id = ? AND offense_level = ?',
        [violation.violation_list_id, violation.offense_level]
      );

      if (!penalty.length) {
        return res.status(400).json({
          success: false,
          error: `Penalty not found for violation ${violation.violation_list_id} with offense level ${violation.offense_level}`
        });
      }

      const penaltyAmount = parseFloat(penalty[0].penalty);
      totalAmount += penaltyAmount;

      violationDetails.push({
        violation_list_id: violation.violation_list_id,
        offense_level: violation.offense_level,
        penalty_applied: penaltyAmount
      });
    }

    // Create violation record and violation junctions in a transaction
    const queries = [
      {
        query: `INSERT INTO violation_record (violator_id, total_amount, status, location, date, 
                apprehending_officer, evidences, officers_note, confiscated, plate_no, 
                or_number, cr_number, is_accident, permit, vehicle_plate_no, year, 
                vehicle_make, body, color, registered_owner, registered_owner_address, 
                vehicle_place_issued)
                VALUES (?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          violator_id, totalAmount, location, date, req.user.id,
          JSON.stringify(evidences), officers_note, confiscated, plate_no,
          or_number, cr_number, is_accident, permit, vehicle_plate_no,
          year, vehicle_make, body, color, registered_owner, registered_owner_address,
          vehicle_place_issued
        ]
      }
    ];

    const results = await executeTransaction(queries);
    const violationRecordId = results[0].insertId;

    // Insert violation junctions
    const junctionQueries = violationDetails.map(detail => ({
      query: 'INSERT INTO violation_junction (violation_record_id, violation_list_id, offense_level, penalty_applied) VALUES (?, ?, ?, ?)',
      params: [violationRecordId, detail.violation_list_id, detail.offense_level, detail.penalty_applied]
    }));

    await executeTransaction(junctionQueries);

    // Get created violation record with details
    const createdRecord = await executeQuery(
      `SELECT vr.*, 
              CONCAT(v.first_name, ' ', v.last_name) as violator_name,
              CONCAT(u.first_name, ' ', u.last_name) as officer_name
       FROM violation_record vr
       JOIN violators v ON vr.violator_id = v.id
       JOIN users u ON vr.apprehending_officer = u.id
       WHERE vr.id = ?`,
      [violationRecordId]
    );

    res.status(201).json({
      success: true,
      message: 'Violation record created successfully',
      data: createdRecord[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create violation record'
    });
  }
});

// PUT /api/v1/violation-records/:id - Update violation record
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation record ID'),
  body('status').optional().isIn(['Pending', 'Paid', 'Overdue', 'Cancelled']).withMessage('Invalid status'),
  body('officers_note').optional().isString().withMessage('Officer\'s note must be a string'),
  body('confiscated').optional().isString().withMessage('Confiscated items must be a string'),
  body('confiscated_returned').optional().isBoolean().withMessage('Confiscated returned must be boolean'),
  body('plate_no').optional().isString().withMessage('Plate number must be a string'),
  body('or_number').optional().isString().withMessage('OR number must be a string'),
  body('cr_number').optional().isString().withMessage('CR number must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violationRecordId = req.params.id;
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

    // Check if violation record exists
    const existingRecord = await executeQuery(
      'SELECT id FROM violation_record WHERE id = ?',
      [violationRecordId]
    );

    if (!existingRecord.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation record not found'
      });
    }

    updateValues.push(violationRecordId);
    const query = `UPDATE violation_record SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    // Get updated violation record
    const updatedRecord = await executeQuery(
      `SELECT vr.*, 
              CONCAT(v.first_name, ' ', v.last_name) as violator_name,
              CONCAT(u.first_name, ' ', u.last_name) as officer_name
       FROM violation_record vr
       JOIN violators v ON vr.violator_id = v.id
       JOIN users u ON vr.apprehending_officer = u.id
       WHERE vr.id = ?`,
      [violationRecordId]
    );

    res.json({
      success: true,
      message: 'Violation record updated successfully',
      data: updatedRecord[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update violation record'
    });
  }
});

// DELETE /api/v1/violation-records/:id - Delete violation record (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation record ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const violationRecordId = req.params.id;

    // Check if violation record exists
    const existingRecord = await executeQuery(
      'SELECT id FROM violation_record WHERE id = ?',
      [violationRecordId]
    );

    if (!existingRecord.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation record not found'
      });
    }

    // Check if there are payments
    const payments = await executeQuery(
      'SELECT id FROM payments WHERE violation_record_id = ?',
      [violationRecordId]
    );

    if (payments.length) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete violation record with existing payments'
      });
    }

    // Delete violation junctions first
    await executeQuery('DELETE FROM violation_junction WHERE violation_record_id = ?', [violationRecordId]);
    
    // Delete violation record
    await executeQuery('DELETE FROM violation_record WHERE id = ?', [violationRecordId]);

    res.json({
      success: true,
      message: 'Violation record deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete violation record'
    });
  }
});

// GET /api/v1/violation-records/:id/evidences - Get evidence files for a violation record
router.get('/:id/evidences', [
  param('id').isInt({ min: 1 }).withMessage('Invalid violation record ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const violationRecord = await executeQuery(
      'SELECT evidences FROM violation_record WHERE id = ?',
      [req.params.id]
    );

    if (!violationRecord.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation record not found'
      });
    }

    const evidences = JSON.parse(violationRecord[0].evidences || '[]');

    res.json({
      success: true,
      data: evidences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch evidence files'
    });
  }
});

module.exports = router;
