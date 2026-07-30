const jwt = require("jsonwebtoken");

exports.generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
};
exports.generateAccessToken = (user, sessionId) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            sessionId: sessionId
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "30m",
        }
    );
};
exports.generateRefreshToken = (user, sessionId) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            sessionId: sessionId
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
};