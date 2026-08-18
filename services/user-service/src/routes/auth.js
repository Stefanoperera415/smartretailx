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
router.post("/register-admin",  async (req, res) => {
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

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("");
    console.log("==============================================");
    console.log("LOGIN DEBUG");
    console.log("==============================================");
    console.log("Email:", email);
    console.log("Password received:", !!password);

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    // -------------------------------------------------
    // FIND USER
    // -------------------------------------------------
    console.log("Finding user by email...");

    const user = await userRepository.findByEmail(email);

    console.log("User found:", !!user);

    if (!user) {
      console.log("USER NOT FOUND");

      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    console.log("User ID:", user.id);
    console.log("User role:", user.role);
    console.log("Password hash exists:", !!user.passwordHash);
    console.log(
      "Password hash length:",
      user.passwordHash ? user.passwordHash.length : 0
    );

    // -------------------------------------------------
    // CHECK PASSWORD
    // -------------------------------------------------
    console.log("Comparing password...");

    const match = await bcrypt.compare(
      password,
      user.passwordHash
    );

    console.log("Password match:", match);

    if (!match) {
      console.log("PASSWORD DOES NOT MATCH");

      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // -------------------------------------------------
    // CHECK JWT CONFIG
    // -------------------------------------------------
    console.log("Password correct.");
    console.log("Creating JWT...");
    console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);
    console.log(
      "JWT_SECRET length:",
      process.env.JWT_SECRET
        ? process.env.JWT_SECRET.length
        : 0
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    console.log("JWT created successfully");
    console.log("LOGIN SUCCESS");
    console.log("==============================================");

    res.json({ token });

  } catch (err) {

    console.error("");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("LOGIN INTERNAL ERROR");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:");
    console.error(err.stack);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    res.status(500).json({
      error: "Login failed",
      message: err.message
    });
  }
});

// Logout – client discards token; we just send a success response
router.post("/logout", (req, res) => {
  res.status(200).json({ message: "Logged out successfully" });
});

module.exports = router;