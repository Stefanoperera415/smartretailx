const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const userRepository = require("../repositories/userRepository");
const { authenticate, authorize } = require("../middleware/auth");  // ← add this line

const router = express.Router();

// Public registration – creates a CUSTOMER
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: "email, password, firstName and lastName are required",
      });
    }
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }
    const user = {
      id: `U${Date.now()}`,
      email,
      firstName,
      lastName,
      phone: phone || null,
      role: "CUSTOMER",
      status: "ACTIVE",
      password,
    };
    const createdUser = await userRepository.create(user);
    res.status(201).json({ data: createdUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Protected admin registration – requires ADMIN token
router.post("/register-admin", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: "email, password, firstName and lastName are required",
      });
    }
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }
    const user = {
      id: `U${Date.now()}`,
      email,
      firstName,
      lastName,
      phone: phone || null,
      role: "ADMIN",
      status: "ACTIVE",
      password,
    };
    const createdUser = await userRepository.create(user);
    res.status(201).json({ data: createdUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Admin registration failed" });
  }
});

// Login (unchanged)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;