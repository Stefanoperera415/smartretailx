CREATE DATABASE IF NOT EXISTS smartretailx_users;
CREATE DATABASE IF NOT EXISTS smartretailx_orders;
CREATE DATABASE IF NOT EXISTS smartretailx_payment;

GRANT ALL PRIVILEGES ON smartretailx_users.* TO 'smartretailx'@'%';
GRANT ALL PRIVILEGES ON smartretailx_orders.* TO 'smartretailx'@'%';
GRANT ALL PRIVILEGES ON smartretailx_payment.* TO 'smartretailx'@'%';

FLUSH PRIVILEGES;


-- Create users table with password_hash column
USE smartretailx_users;

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role ENUM('CUSTOMER','STAFF','ADMIN') DEFAULT 'CUSTOMER',
    status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);