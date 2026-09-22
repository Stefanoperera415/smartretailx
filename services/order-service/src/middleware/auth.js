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

  verifier = CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse,
  });

  return verifier;
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    const payload = await getVerifier().verify(token);

    // Map Cognito groups to roles
    const groups = payload["cognito:groups"] || [];
    const role = groups.includes("ADMIN") ? "ADMIN" :
                 groups.includes("STAFF") ? "STAFF" : "CUSTOMER";

    // Shape matches your existing codebase (req.user.id, req.user.role)
    req.user = {
      id: payload.sub, // Cognito's unique user ID
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