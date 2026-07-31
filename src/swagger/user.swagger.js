/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User authentication and profile APIs
 */


/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: Register new user
 *     tags: [Users]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Lokesh
 *
 *               email:
 *                 type: string
 *                 example: lokesh@gmail.com
 *
 *               password:
 *                 type: string
 *                 example: Password@123
 *
 *     responses:
 *       201:
 *         description: User registered successfully
 *
 *       400:
 *         description: Validation error
 */


/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: Login user
 *     tags: [Users]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: lokesh@gmail.com
 *
 *               password:
 *                 type: string
 *                 example: Password@123
 *
 *     responses:
 *       200:
 *         description: Login successful
 *
 *       400:
 *         description: Invalid credentials
 */


/**
 * @swagger
 * /api/user/logout:
 *   post:
 *     summary: Logout current device
 *     tags: [Users]
 *
 *     security:
 *       - cookieAuth: []
 *
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *
 *       401:
 *         description: Invalid or missing refresh token
 */

/**
 * @swagger
 * /api/user/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Users]
 *
 *     security:
 *       - cookieAuth: []
 *
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out from all devices successfully
 *
 *       401:
 *         description: Refresh token not found
 *
 *       400:
 *         description: Invalid refresh token
 */

/**
 * @swagger
 * /api/user/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *
 *     security:
 *       - bearerAuth: []
 *
 *     responses:
 *       200:
 *         description: Users fetched successfully
 *
 *       401:
 *         description: Unauthorized user
 */

/**
 * @swagger
 * /api/user/get-me:
 *   get:
 *     summary: Get current logged-in user details
 *     tags: [Users]
 *
 *     security:
 *       - bearerAuth: []
 *
 *     responses:
 *       200:
 *         description: User details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   example:
 *                     _id: 65a123456789
 *                     name: Lokesh
 *                     email: lokesh@gmail.com
 *
 *       401:
 *         description: Token not found
 *
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user/verify-email:
 *   post:
 *     summary: Verify email using OTP
 *     tags: [Users]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: lokesh@gmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *
 *     responses:
 *       200:
 *         description: Email verified successfully
 *
 *       400:
 *         description: Invalid email or OTP
 *
 *       500:
 *         description: Internal server error
 */


/**
 * @swagger
 * /api/user/forgot-password:
 *   post:
 *     summary: Send OTP for password reset
 *     tags: [Users]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: lokesh@gmail.com
 *
 *     responses:
 *       200:
 *         description: OTP sent to email successfully
 *
 *       404:
 *         description: User not found
 *
 *       500:
 *         description: Internal server error
 */


/**
 * @swagger
 * /api/user/reset-password:
 *   post:
 *     summary: Reset password using OTP
 *     tags: [Users]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *
 *             properties:
 *               email:
 *                 type: string
 *                 example: lokesh@gmail.com
 *
 *               otp:
 *                 type: string
 *                 example: "123456"
 *
 *               newPassword:
 *                 type: string
 *                 example: NewPassword@123
 *
 *     responses:
 *       200:
 *         description: Password reset successfully
 *
 *       400:
 *         description: Invalid email or OTP
 *
 *       500:
 *         description: Internal server error
 */


/**
 * @swagger
 * /api/user/refresh-token:
 *   post:
 *     summary: Generate new access token using refresh token
 *     tags: [Users]
 *
 *     security:
 *       - cookieAuth: []
 *
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIs...
 *
 *       401:
 *         description: Invalid or expired refresh token
 */

/**
 * @swagger
 * /api/user/update-password:
 *   post:
 *     summary: Update password for the currently logged-in user
 *     description: >
 *       Requires the current password for verification. On success, all other
 *       active sessions/devices are logged out; the current session stays active.
 *     tags: [Users]
 *
 *     security:
 *       - bearerAuth: []
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - newPassword
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password
 *                 example: Password@123
 *               newPassword:
 *                 type: string
 *                 description: New password (minimum 8 characters)
 *                 example: NewPassword@456
 *
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password updated successfully. You've been logged out of all other devices.
 *
 *       400:
 *         description: Missing fields, weak new password, or invalid current password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid current password
 *
 *       401:
 *         description: Unauthorized — missing or invalid access token
 *
 *       404:
 *         description: User not found
 *
 *       500:
 *         description: Internal server error
 */