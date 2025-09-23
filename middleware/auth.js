const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user details from database
    const user = await executeQuery(
      'SELECT id, email, first_name, last_name, role_id, team_id, badge_number, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user.length) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user[0].is_active) {
      return res.status(401).json({
        success: false,
        error: 'User account is inactive'
      });
    }

    req.user = user[0];
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

const requireRole = (roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get role name from database
    const role = await executeQuery(
      'SELECT name FROM roles WHERE id = ?',
      [req.user.role_id]
    );

    if (!role.length) {
      return res.status(403).json({
        success: false,
        error: 'Invalid user role'
      });
    }

    const userRole = role[0].name;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
