const cookies_options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    // maxAge: 7 * 24 * 60 * 60 * 1000,
};

module.exports = {cookies_options}