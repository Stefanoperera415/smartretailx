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


-- ============================================================
-- Payment Service Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS smartretailx_payment.payments (
    payment_id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    customer_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'GBP',
    status ENUM('PENDING','AUTHORIZED','COMPLETED','FAILED','REFUNDED') DEFAULT 'PENDING',
    provider VARCHAR(50),
    transaction_ref VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS smartretailx_payment.processed_events (
    event_id VARCHAR(191) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id)
) ENGINE=InnoDB;


-- ============================================================
-- Orders Database
-- ============================================================
CREATE DATABASE IF NOT EXISTS smartretailx_orders;
USE smartretailx_orders;
CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    status ENUM('PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','PAYMENT_FAILED') DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'GBP',
    shipping_address JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);