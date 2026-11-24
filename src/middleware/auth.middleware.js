
const { verifyFirebaseIdToken } = require('../config/firebase-admin');

const PRIMARY_PROJECT_ID = 'sellerportal-2786c';

function getUserIdentityFilter(user) {
  const projectId = user.firebaseProjectId || PRIMARY_PROJECT_ID;
  const projectScope = projectId === PRIMARY_PROJECT_ID
    ? { $or: [{ firebaseProjectId: projectId }, { firebaseProjectId: { $exists: false } }] }
    : { firebaseProjectId: projectId };
  return {
    $and: [
      { firebaseUid: user.uid },
      projectScope
    ]
  };
}

/**
 * Middleware to verify Firebase ID token.
 * Supports configured Firebase projects.
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

  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Missing or malformed Authorization header.'
    });
  }

  try {
    // Verify the token against configured Firebase projects
    const decodedToken = await verifyFirebaseIdToken(match[1]);
    const projectId = decodedToken.aud;

    req.user = {
      uid: decodedToken.uid,
      firebaseProjectId: projectId,
      databaseUid: projectId === PRIMARY_PROJECT_ID
        ? decodedToken.uid
        : `${projectId}:${decodedToken.uid}`,
      email: decodedToken.email,
      name: decodedToken.name,
      provider: decodedToken.firebase?.sign_in_provider,
      emailVerified: decodedToken.email_verified
    };

    next();
  } catch (error) {
    console.warn('[auth] Firebase ID token rejected', {
      reason: error?.code === 'auth/id-token-expired' ? 'expired_token' : 'invalid_token',
      ...(typeof error?.code === 'string' ? { firebaseCode: error.code } : {})
    });

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
  requireFirebaseAuth,
  getUserIdentityFilter
};
