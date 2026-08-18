const express = require("express");
const userRepository = require("../repositories/userRepository");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// Apply authentication to all routes in this file
router.use(authenticate);

router.get("/", authorize("ADMIN", "STAFF"), async (req, res) => {
  // STAFF and ADMIN can view all users
  try {
    const users = await userRepository.findAll();
    res.status(200).json({ data: users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve users" });
  }
});

// ---- GET /:id - Allow CUSTOMER to view own profile, STAFF/ADMIN any ----
router.get("/:id", async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // CUSTOMER can only see themselves
    if (req.user.role === "CUSTOMER" && req.user.id !== req.params.id) {
      return res.status(403).json({ error: "You can only view your own profile" });
    }

    res.status(200).json({ data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve user" });
  }
});

router.post("/", authorize("ADMIN"), async (req, res) => {
  // Only ADMIN can create new users (or STAFF? decide)
  try {
    const { email, firstName, lastName, phone, role = "CUSTOMER", password } = req.body;

    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({
        error: "email, firstName, lastName and password are required",
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
      phone,
      role,
      status: "ACTIVE",
      password,
    };

    const createdUser = await userRepository.create(user);
    res.status(201).json({ data: createdUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ---- PUT /:id - Allow CUSTOMER to update own profile, STAFF/ADMIN any ----
router.put("/:id", async (req, res) => {
  try {
    const existing = await userRepository.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // CUSTOMER can only update themselves
    if (req.user.role === "CUSTOMER" && req.user.id !== req.params.id) {
      return res.status(403).json({ error: "You can only update your own profile" });
    }

    // Restrict role and status changes for non-ADMIN
    if (req.user.role !== "ADMIN") {
      // Prevent changing role or status for others (and for self as well)
      if (req.body.role !== undefined) {
        return res.status(403).json({ error: "Only ADMIN can change role" });
      }
      if (req.body.status !== undefined && req.user.role === "CUSTOMER") {
        // STAFF may update status, CUSTOMER cannot
        return res.status(403).json({ error: "You cannot change status" });
      }
      // STAFF can update status, but not role
    }

    const updated = await userRepository.update(req.params.id, req.body);
    res.status(200).json({ data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// *** FIXED: now only ADMIN can delete ***
router.delete("/:id", authorize("ADMIN"), async (req, res) => {
  try {
    const deleted = await userRepository.remove(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;