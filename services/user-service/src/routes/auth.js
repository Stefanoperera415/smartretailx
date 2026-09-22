const express = require("express");
const { authenticate } = require("../middleware/auth");
const { ensureUser } = require("../middleware/ensureUser");

const router = express.Router();

// GET /auth/me - Returns the current user profile from DB.
// Automatically creates the profile if it doesn't exist yet (JIT).
router.get("/me", authenticate, ensureUser, (req, res) => {
  res.status(200).json({ data: req.dbUser });
});

// POST /auth/logout - Client side clears Cognito tokens.
router.post("/logout", authenticate, (req, res) => {
  res.status(200).json({ message: "Logged out. Discard your Cognito tokens on the client." });
});

module.exports = router;