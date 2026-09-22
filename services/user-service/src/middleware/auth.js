const { CognitoJwtVerifier } = require("aws-jwt-verify");

let verifier = null;

function getVerifier() {
  if (verifier) return verifier;

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const tokenUse = process.env.COGNITO_TOKEN_USE || "id";

  if (!userPoolId || !clientId) {
    throw new Error("COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set");
  }

  verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse });
  return verifier;
}

async function authenticate(req, res, next) {
  // 🔑 Internal service-to-service calls: allow a shared-secret header
  const internalKey = req.headers["x-internal-key"];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (expectedKey && internalKey && internalKey === expectedKey) {
    req.user = {
      id: null,
      email: null,
      role: "SERVICE",
      isService: true,
    };
    return next();
  }

  // --- Cognito path (unchanged) ---
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    const payload = await getVerifier().verify(token);

    const groups = payload["cognito:groups"] || [];
    const role = groups.includes("ADMIN")
      ? "ADMIN"
      : groups.includes("STAFF")
      ? "STAFF"
      : "CUSTOMER";

    req.user = {
      id: payload.sub,
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      phone: payload.phone_number,
      role,
      groups,
      claims: payload,
    };

    next();
  } catch (err) {
    console.error("Cognito token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticate, authorize };