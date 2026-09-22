const userRepository = require("../repositories/userRepository");

async function ensureUser(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    let user = await userRepository.findById(req.user.id);

    if (!user) {
      user = await userRepository.create({
        id: req.user.id, // Cognito sub
        email: req.user.email || `${req.user.id}@placeholder.local`,
        firstName: req.user.firstName || "",
        lastName: req.user.lastName || "",
        phone: req.user.phone || null,
        role: req.user.role, // from Cognito groups
        status: "ACTIVE",
      });
      console.log(`JIT-provisioned user ${user.id} in database.`);
    }

    req.dbUser = user;
    next();
  } catch (err) {
    console.error("ensureUser error:", err);
    return res.status(500).json({ error: "Failed to sync user profile" });
  }
}

module.exports = { ensureUser };