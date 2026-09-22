const express = require("express");
const userRepository = require("../repositories/userRepository");
const { authenticate, authorize } = require("../middleware/auth");
const {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const router = express.Router();

// Initialize Cognito client once at module load
const cognito = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || "ap-south-1",
});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
if (!USER_POOL_ID) {
  throw new Error("COGNITO_USER_POOL_ID must be set");
}

const ALL_ROLES = ["ADMIN", "STAFF", "CUSTOMER"];

// Apply authentication to all routes in this file
router.use(authenticate);

// ---- GET / - List all users (ADMIN, STAFF) ----
router.get("/", authorize("ADMIN", "STAFF"), async (req, res) => {
  try {
    const users = await userRepository.findAll();
    res.status(200).json({ data: users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve users" });
  }
});

// ---- PUT /:id/role - Change a user's role (ADMIN only) ----
// NOTE: must be declared BEFORE the generic PUT /:id route
router.put("/:id/role", authorize("ADMIN"), async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!ALL_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ error: `role must be one of: ${ALL_ROLES.join(", ")}` });
    }

    // Prevent an admin from demoting themselves (avoid lock-out)
    if (targetUserId === req.user.id && role !== "ADMIN") {
      return res
        .status(400)
        .json({ error: "You cannot remove your own ADMIN role" });
    }

    // Confirm the user exists in the local DB
    const existing = await userRepository.findById(targetUserId);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    // 1) Remove from every group (ignore "not in group" errors)
    for (const g of ALL_ROLES) {
      try {
        await cognito.send(
          new AdminRemoveUserFromGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: targetUserId, // Cognito accepts the sub as Username
            GroupName: g,
          })
        );
      } catch (err) {
        // UserNotInGroupException etc. – fine to ignore
        if (err.name !== "UserNotFoundException") {
          // log only truly unexpected ones
          if (err.name !== "ResourceNotFoundException") {
            // no-op – safe to ignore
          }
        }
      }
    }

    // 2) Add to the target group
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUserId,
        GroupName: role,
      })
    );

    // 3) Mirror the change in the local DB (informational only)
    const updated = await userRepository.update(targetUserId, { role });

    console.log(
      `Admin ${req.user.email} set role of user ${targetUserId} to ${role}`
    );

    return res.status(200).json({
      message: `User role updated to ${role}. They must log out and log back in for changes to take effect.`,
      data: updated,
    });
  } catch (error) {
    console.error("Assign role error:", error);
    return res.status(500).json({ error: "Failed to assign role" });
  }
});

// ---- GET /:id - Allow CUSTOMER to view own profile, STAFF/ADMIN any ----
router.get("/:id", async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (req.user.role === "CUSTOMER" && req.user.id !== req.params.id) {
      return res
        .status(403)
        .json({ error: "You can only view your own profile" });
    }
    res.status(200).json({ data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve user" });
  }
});

// ---- PUT /:id - Update profile (self or ADMIN) ----
router.put("/:id", async (req, res) => {
  try {
    const existing = await userRepository.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    if (req.user.role === "CUSTOMER" && req.user.id !== req.params.id) {
      return res
        .status(403)
        .json({ error: "You can only update your own profile" });
    }

    if (req.user.role !== "ADMIN") {
      if (req.body.role !== undefined) {
        return res.status(403).json({ error: "Only ADMIN can change role" });
      }
      if (req.body.status !== undefined && req.user.role === "CUSTOMER") {
        return res.status(403).json({ error: "You cannot change status" });
      }
    }

    const updated = await userRepository.update(req.params.id, req.body);
    res.status(200).json({ data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ---- DELETE /:id - Only ADMIN ----
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