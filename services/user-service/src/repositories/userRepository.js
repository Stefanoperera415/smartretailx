const { pool } = require("../config/database");
const bcrypt = require("bcrypt");

// Helper to map DB row to camelCase (excluding password_hash)
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAll() {
  const [rows] = await pool.execute(`
    SELECT
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      created_at,
      updated_at
    FROM users
    ORDER BY created_at DESC
  `);
  return rows.map(mapUser);
}

async function findById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      created_at,
      updated_at
    FROM users
    WHERE user_id = ?
    `,
    [id]
  );
  return mapUser(rows[0]);
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `
    SELECT
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      password_hash
    FROM users
    WHERE email = ?
    `,
    [email]
  );
  const row = rows[0];
  if (!row) return null;
  // Return full row including hash for authentication
  return {
    id: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash,
  };
}

async function create(user) {
  const hashedPassword = await bcrypt.hash(user.password, 10);
  await pool.execute(
    `
    INSERT INTO users
    (
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      password_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.phone || null,
      user.role || "CUSTOMER",
      user.status || "ACTIVE",
      hashedPassword,
    ]
  );
  return findById(user.id);
}

async function update(id, updates) {
  const fields = [];
  const values = [];

  const mapping = {
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    phone: "phone",
    role: "role",
    status: "status",
    password: "password_hash", // special handling
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (updates[key] !== undefined) {
      if (key === "password") {
        // Hash the new password
        const hashed = await bcrypt.hash(updates.password, 10);
        fields.push(`${column} = ?`);
        values.push(hashed);
      } else {
        fields.push(`${column} = ?`);
        values.push(updates[key]);
      }
    }
  }

  if (fields.length === 0) {
    return findById(id);
  }

  values.push(id);

  await pool.execute(
    `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE user_id = ?
    `,
    values
  );

  return findById(id);
}

async function remove(id) {
  const [result] = await pool.execute(
    "DELETE FROM users WHERE user_id = ?",
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findAll,
  findById,
  findByEmail,
  create,
  update,
  remove,
};