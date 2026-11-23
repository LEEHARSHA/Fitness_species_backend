const { getAuth } = require('firebase-admin/auth');

/**
 * Middleware to verify Firebase ID token.
 * Looks for 'Authorization: Bearer <ID_TOKEN>'
 */
const requireFirebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Missing or malformed Authorization header.'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // Verify the token using modular approach
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Attach the verified user details to the request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      provider: decodedToken.firebase.sign_in_provider
    };

    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error.message);

    let message = 'Invalid or expired authentication token.';
    if (error.code === 'auth/id-token-expired') {
      message = 'Authentication token has expired.';
    } else if (error.code === 'auth/id-token-revoked') {
      message = 'Authentication token has been revoked.';
    }

    return res.status(401).json({
      success: false,
      message: message
    });
  }
};

module.exports = {
  requireFirebaseAuth
};
