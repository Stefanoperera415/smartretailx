const { pool } = require("../config/database");

async function findAll() {
  const [rows] = await pool.execute(`
    SELECT
      user_id AS id,
      email,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      role,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    ORDER BY created_at DESC
  `);

  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      user_id AS id,
      email,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      role,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE user_id = ?
    `,
    [id]
  );

  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `
    SELECT
      user_id AS id,
      email,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      role,
      status
    FROM users
    WHERE email = ?
    `,
    [email]
  );

  return rows[0] || null;
}

async function create(user) {
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
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      user.id,
      user.email,
      user.firstName,
      user.lastName,
      user.phone || null,
      user.role || "CUSTOMER",
      user.status || "ACTIVE"
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
    status: "status"
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (updates[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(updates[key]);
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
  remove
};