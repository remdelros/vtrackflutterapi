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

// GET /api/v1/payments - Get all payments with pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('violation_record_id').optional().isInt({ min: 1 }).withMessage('Invalid violation record ID'),
  query('payment_method').optional().isIn(['Cash', 'Bank Transfer', 'Check', 'Online']).withMessage('Invalid payment method'),
  query('date_from').optional().isISO8601().withMessage('Invalid date format'),
  query('date_to').optional().isISO8601().withMessage('Invalid date format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, 
             CONCAT(v.first_name, ' ', v.last_name) as violator_name,
             vr.total_amount, vr.status as violation_status,
             CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
      FROM payments p
      JOIN violation_record vr ON p.violation_record_id = vr.id
      JOIN violators v ON vr.violator_id = v.id
      LEFT JOIN users u ON p.processed_by = u.id
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      JOIN violation_record vr ON p.violation_record_id = vr.id
      JOIN violators v ON vr.violator_id = v.id
      WHERE 1=1
    `;
    let params = [];
    let countParams = [];

    // Apply filters
    if (req.query.violation_record_id) {
      query += ' AND p.violation_record_id = ?';
      countQuery += ' AND p.violation_record_id = ?';
      params.push(req.query.violation_record_id);
      countParams.push(req.query.violation_record_id);
    }

    if (req.query.payment_method) {
      query += ' AND p.payment_method = ?';
      countQuery += ' AND p.payment_method = ?';
      params.push(req.query.payment_method);
      countParams.push(req.query.payment_method);
    }

    if (req.query.date_from) {
      query += ' AND p.paid_at >= ?';
      countQuery += ' AND p.paid_at >= ?';
      params.push(req.query.date_from);
      countParams.push(req.query.date_from);
    }

    if (req.query.date_to) {
      query += ' AND p.paid_at <= ?';
      countQuery += ' AND p.paid_at <= ?';
      params.push(req.query.date_to);
      countParams.push(req.query.date_to);
    }

    query += ' ORDER BY p.paid_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [payments, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, countParams)
    ]);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: payments,
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
      error: 'Failed to fetch payments'
    });
  }
});

// GET /api/v1/payments/:id - Get payment by ID
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid payment ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const payment = await executeQuery(
      `SELECT p.*, 
              CONCAT(v.first_name, ' ', v.last_name) as violator_name,
              vr.total_amount, vr.status as violation_status, vr.location,
              CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
       FROM payments p
       JOIN violation_record vr ON p.violation_record_id = vr.id
       JOIN violators v ON vr.violator_id = v.id
       LEFT JOIN users u ON p.processed_by = u.id
       WHERE p.id = ?`,
      [req.params.id]
    );

    if (!payment.length) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: payment[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
    error: 'Failed to fetch payment'
    });
  }
});

// POST /api/v1/payments - Create new payment
router.post('/', [
  body('violation_record_id').isInt({ min: 1 }).withMessage('Valid violation record ID is required'),
  body('receipt_no').isString().isLength({ min: 1, max: 100 }).withMessage('Receipt number is required'),
  body('paid_at').isISO8601().withMessage('Valid payment date is required'),
  body('amount_paid').isDecimal().withMessage('Amount paid must be a decimal number'),
  body('payment_method').isIn(['Cash', 'Bank Transfer', 'Check', 'Online']).withMessage('Invalid payment method'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      violation_record_id, receipt_no, paid_at, amount_paid, payment_method, notes
    } = req.body;

    // Check if violation record exists and is not already paid
    const violationRecord = await executeQuery(
      'SELECT id, total_amount, status FROM violation_record WHERE id = ?',
      [violation_record_id]
    );

    if (!violationRecord.length) {
      return res.status(404).json({
        success: false,
        error: 'Violation record not found'
      });
    }

    if (violationRecord[0].status === 'Paid') {
      return res.status(400).json({
        success: false,
        error: 'Violation record is already paid'
      });
    }

    // Check if receipt number already exists
    const existingReceipt = await executeQuery(
      'SELECT id FROM payments WHERE receipt_no = ?',
      [receipt_no]
    );

    if (existingReceipt.length) {
      return res.status(409).json({
        success: false,
        error: 'Receipt number already exists'
      });
    }

    // Create payment and update violation record status in a transaction
    const queries = [
      {
        query: `INSERT INTO payments (violation_record_id, receipt_no, paid_at, amount_paid, 
                payment_method, processed_by, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [violation_record_id, receipt_no, paid_at, amount_paid, payment_method, req.user.id, notes]
      },
      {
        query: 'UPDATE violation_record SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        params: ['Paid', violation_record_id]
      }
    ];

    const results = await executeTransaction(queries);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        id: results[0].insertId,
        violation_record_id, receipt_no, paid_at, amount_paid, payment_method, notes
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create payment'
    });
  }
});

// PUT /api/v1/payments/:id - Update payment (admin/treasurer only)
router.put('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid payment ID'),
  body('receipt_no').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Receipt number must be 1-100 characters'),
  body('paid_at').optional().isISO8601().withMessage('Valid payment date is required'),
  body('amount_paid').optional().isDecimal().withMessage('Amount paid must be a decimal number'),
  body('payment_method').optional().isIn(['Cash', 'Bank Transfer', 'Check', 'Online']).withMessage('Invalid payment method'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  handleValidationErrors,
  requireRole(['admin', 'treasurer'])
], async (req, res) => {
  try {
    const paymentId = req.params.id;
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

    // Check if payment exists
    const existingPayment = await executeQuery(
      'SELECT id FROM payments WHERE id = ?',
      [paymentId]
    );

    if (!existingPayment.length) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    updateValues.push(paymentId);
    const query = `UPDATE payments SET ${updateFields.join(', ')}, created_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await executeQuery(query, updateValues);

    res.json({
      success: true,
      message: 'Payment updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update payment'
    });
  }
});

// DELETE /api/v1/payments/:id - Delete payment (admin only)
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid payment ID'),
  handleValidationErrors,
  requireRole(['admin'])
], async (req, res) => {
  try {
    const paymentId = req.params.id;

    // Get payment details
    const payment = await executeQuery(
      'SELECT violation_record_id FROM payments WHERE id = ?',
      [paymentId]
    );

    if (!payment.length) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Delete payment and update violation record status in a transaction
    const queries = [
      {
        query: 'DELETE FROM payments WHERE id = ?',
        params: [paymentId]
      },
      {
        query: 'UPDATE violation_record SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        params: ['Pending', payment[0].violation_record_id]
      }
    ];

    await executeTransaction(queries);

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete payment'
    });
  }
});

module.exports = router;
