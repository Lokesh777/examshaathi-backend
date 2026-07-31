const cookies_options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // sameSite: "strict",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000, //7days
};

module.exports = {cookies_options}