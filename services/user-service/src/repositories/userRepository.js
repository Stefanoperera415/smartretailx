const database = require("../config/database");  // ← import the module, not the property
const bcrypt = require("bcrypt");

// Helper to map DB row to camelCase
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
  const pool = database.pool;  // get current pool
  const result = await pool.query(`
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
  return result.rows.map(mapUser);
}

async function findById(id) {
  const pool = database.pool;
  const result = await pool.query(
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
    WHERE user_id = $1
    `,
    [id]
  );
  return mapUser(result.rows[0]);
}

async function findByEmail(email) {
  const pool = database.pool;
  const result = await pool.query(
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
    WHERE email = $1
    `,
    [email]
  );
  const row = result.rows[0];
  if (!row) return null;
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
  const pool = database.pool;
  const hashedPassword = await bcrypt.hash(user.password, 10);
  const result = await pool.query(
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      created_at,
      updated_at
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
  return mapUser(result.rows[0]);
}

async function update(id, updates) {
  const pool = database.pool;
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const mapping = {
    email: "email",
    firstName: "first_name",
    lastName: "last_name",
    phone: "phone",
    role: "role",
    status: "status",
    password: "password_hash",
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (updates[key] !== undefined) {
      if (key === "password") {
        const hashed = await bcrypt.hash(updates.password, 10);
        fields.push(`${column} = $${paramIndex}`);
        values.push(hashed);
        paramIndex++;
      } else {
        fields.push(`${column} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    }
  }

  if (fields.length === 0) {
    return findById(id);
  }

  values.push(id);

  const result = await pool.query(
    `
    UPDATE users
    SET ${fields.join(", ")}
    WHERE user_id = $${paramIndex}
    RETURNING
      user_id,
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      created_at,
      updated_at
    `,
    values
  );

  return mapUser(result.rows[0]);
}

async function remove(id) {
  const pool = database.pool;
  const result = await pool.query(
    "DELETE FROM users WHERE user_id = $1",
    [id]
  );
  return result.rowCount > 0;
}

module.exports = {
  findAll,
  findById,
  findByEmail,
  create,
  update,
  remove,
};