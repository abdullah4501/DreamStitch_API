const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-production";

const signToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );

const getTokenFromAuthHeader = (authorization) => {
  if (!authorization) return null;
  const [type, token] = authorization.split(" ");
  return type === "Bearer" && token ? token : null;
};

const getUserFromRequest = async (req, prisma) => {
  const token = getTokenFromAuthHeader(req && req.headers && req.headers.authorization);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return prisma.user.findUnique({ where: { id: payload.userId } });
  } catch (error) {
    return null;
  }
};

module.exports = {
  signToken,
  getUserFromRequest,
};
