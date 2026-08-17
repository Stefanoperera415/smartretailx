const express = require("express");
const userRepository = require("../repositories/userRepository");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await userRepository.findAll();

    res.status(200).json({
      data: users
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to retrieve users"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.status(200).json({
      data: user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to retrieve user"
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      role = "CUSTOMER"
    } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: "email, firstName and lastName are required"
      });
    }

    const existing = await userRepository.findByEmail(email);

    if (existing) {
      return res.status(409).json({
        error: "User already exists"
      });
    }

    const user = {
      id: `U${Date.now()}`,
      email,
      firstName,
      lastName,
      phone,
      role,
      status: "ACTIVE"
    };

    const createdUser = await userRepository.create(user);

    res.status(201).json({
      data: createdUser
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create user"
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const existing = await userRepository.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const updated = await userRepository.update(
      req.params.id,
      req.body
    );

    res.status(200).json({
      data: updated
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to update user"
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await userRepository.remove(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to delete user"
    });
  }
});

module.exports = router;