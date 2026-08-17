CREATE DATABASE IF NOT EXISTS smartretailx_users;
CREATE DATABASE IF NOT EXISTS smartretailx_orders;
CREATE DATABASE IF NOT EXISTS smartretailx_payment;

GRANT ALL PRIVILEGES ON smartretailx_users.* TO 'smartretailx'@'%';
GRANT ALL PRIVILEGES ON smartretailx_orders.* TO 'smartretailx'@'%';
GRANT ALL PRIVILEGES ON smartretailx_payment.* TO 'smartretailx'@'%';

FLUSH PRIVILEGES;