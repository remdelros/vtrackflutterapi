# VTrack Flutter API

A comprehensive REST API for traffic violation management system built with Express.js and MySQL/MariaDB.

## 🚀 Features

- **User Authentication & Authorization** - JWT-based authentication with role-based access control
- **Violator Management** - Complete CRUD operations for violator records
- **Violation Records** - Create and manage traffic violation citations
- **Payment Processing** - Track payments and receipts
- **File Upload** - Evidence file management with support for images and documents
- **Multi-level Penalties** - First, Second, Third offense penalty system
- **Location & Team Management** - Manage police stations and teams
- **Comprehensive Reporting** - Detailed violation and payment reports

## 📋 Database Schema

The API works with the following main entities:

- **Users** - Police officers, admins, treasurers
- **Violators** - People who commit violations
- **Violation Records** - Main violation citations
- **Violation List** - Types of violations with penalty levels
- **Payments** - Payment records and receipts
- **Locations** - Police stations and outposts
- **Teams** - Police teams assigned to locations
- **Roles** - User roles (admin, officer, treasurer, lgu)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd vtrackflutterapi
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your database credentials:
   ```env
   # Database Configuration
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=u674714135_vtrack
   DB_USER=your_username
   DB_PASSWORD=your_password
   
   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=24h
   ```

4. **Import database schema**
   ```bash
   mysql -u your_username -p u674714135_vtrack < u674714135_vtrack.sql
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@vtrack.com",
  "password": "password123"
}
```

#### Register (Admin only)
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "officer@vtrack.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "role_id": 2,
  "team_id": 1,
  "badge_number": "B001",
  "phone": "555-0101"
}
```

### Violators

#### Get All Violators
```http
GET /api/v1/violators?page=1&limit=10&search=john
```

#### Get Violator by ID
```http
GET /api/v1/violators/1
```

#### Create Violator
```http
POST /api/v1/violators
Content-Type: application/json

{
  "contact_no": "09177758872",
  "drivers_license": "ABC123",
  "first_name": "John",
  "last_name": "Doe",
  "gender": "Male",
  "address": "123 Main St",
  "age": 25,
  "date_of_birth": "1998-01-01",
  "nationality": "Filipino",
  "license_type": "Professional"
}
```

#### Update Violator
```http
PUT /api/v1/violators/1
Content-Type: application/json

{
  "phone": "09177758873",
  "address": "456 New St"
}
```

#### Get Violator's Violations
```http
GET /api/v1/violators/1/violations?status=Pending
```

### Violation Records

#### Get All Violation Records
```http
GET /api/v1/violation-records?page=1&limit=10&status=Pending&violator_id=1
```

#### Get Violation Record by ID
```http
GET /api/v1/violation-records/1
```

#### Create Violation Record
```http
POST /api/v1/violation-records
Content-Type: multipart/form-data

{
  "violator_id": 1,
  "location": "Tuguegarao City, Cagayan",
  "date": "2025-09-23T10:00:00Z",
  "violations": [
    {
      "violation_list_id": 1,
      "offense_level": "First Offense"
    }
  ],
  "officers_note": "Speeding violation",
  "confiscated": "Driver's license",
  "plate_no": "ABC123",
  "evidences": [file1, file2]
}
```

#### Update Violation Record
```http
PUT /api/v1/violation-records/1
Content-Type: application/json

{
  "status": "Paid",
  "confiscated_returned": true
}
```

### Payments

#### Get All Payments
```http
GET /api/v1/payments?page=1&limit=10&payment_method=Cash
```

#### Create Payment
```http
POST /api/v1/payments
Content-Type: application/json

{
  "violation_record_id": 1,
  "receipt_no": "OR-12345",
  "paid_at": "2025-09-23T14:00:00Z",
  "amount_paid": 1000.00,
  "payment_method": "Cash",
  "notes": "Payment received"
}
```

### Violation List

#### Get All Violation Types
```http
GET /api/v1/violation-list?level=Major
```

#### Create Violation Type (Admin only)
```http
POST /api/v1/violation-list
Content-Type: application/json

{
  "name": "Reckless Driving",
  "level": "Severe",
  "penalty": 2000.00,
  "description": "Driving without due care"
}
```

### Locations

#### Get All Locations
```http
GET /api/v1/locations
```

#### Create Location (Admin only)
```http
POST /api/v1/locations
Content-Type: application/json

{
  "name": "Main Police Station",
  "street_address": "123 Police St",
  "zip_code": "3500"
}
```

### Teams

#### Get All Teams
```http
GET /api/v1/teams?location_id=1
```

#### Create Team (Admin only)
```http
POST /api/v1/teams
Content-Type: application/json

{
  "name": "Alpha Team",
  "description": "Main patrol unit",
  "location_id": 1
}
```

### Users

#### Get All Users (Admin only)
```http
GET /api/v1/users?page=1&limit=10&role_id=2
```

#### Update User Profile
```http
PUT /api/v1/users/1
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Smith",
  "phone": "555-0101"
}
```

## 🔐 User Roles

- **Admin** - Full system access
- **Officer** - Field operations, create violations
- **Treasurer** - Payment processing
- **LGU** - Local government unit access

## 📁 File Uploads

Evidence files are stored in the `uploads/` directory and can be accessed via:
```
http://localhost:3000/uploads/filename.jpg
```

Supported file types: Images (JPEG, PNG, GIF) and Documents (PDF, DOC, DOCX)

## 🚨 Error Handling

All API responses follow this format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "details": [ ... ]
}
```

## 🔧 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `DB_HOST` | Database host | 127.0.0.1 |
| `DB_PORT` | Database port | 3306 |
| `DB_NAME` | Database name | - |
| `DB_USER` | Database user | - |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | JWT expiration | 24h |
| `UPLOAD_PATH` | File upload path | ./uploads |
| `MAX_FILE_SIZE` | Max file size | 10485760 |

## 📊 Database Procedures

The API includes a stored procedure `CalculateCitationTotal` for calculating violation totals with offense levels.

## 🧪 Testing

Test the API endpoints using tools like:
- Postman
- Insomnia
- curl
- Thunder Client (VS Code extension)

## 📝 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions, please contact the development team.
