function logAuthRejection(reason, error) {
  const firebaseCode = typeof error?.code === 'string' && /^auth\/[a-z-]+$/.test(error.code)
    ? error.code
    : undefined;
  console.warn('[auth] Firebase ID token rejected', {
    reason,
    ...(firebaseCode ? { firebaseCode } : {}),
  });
}

export function requireFirebaseAuth(
  verifyIdToken,
  supportedFirebaseProjectIds = [process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c'],
) {
  return async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) {
      logAuthRejection(authorization ? 'malformed_authorization_header' : 'missing_authorization_header');
      res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Send a Firebase ID token using the Authorization: Bearer header.',
      });
      return;
    }

    try {
      const claims = await verifyIdToken(match[1]);
      const supportedProjects = new Set(supportedFirebaseProjectIds);
      const projectMismatch = typeof claims?.aud === 'string'
        && (
          !supportedProjects.has(claims.aud)
          || claims.iss !== `https://securetoken.google.com/${claims.aud}`
        );
      if (
        !claims
        || typeof claims.uid !== 'string'
        || !claims.uid
        || typeof claims.aud !== 'string'
        || !supportedProjects.has(claims.aud)
        || claims.iss !== `https://securetoken.google.com/${claims.aud}`
      ) {
        logAuthRejection(projectMismatch ? 'firebase_project_mismatch' : 'invalid_token_claims');
        res.status(401).json({
          success: false,
          code: 'TOKEN_INVALID',
          message: 'The Firebase ID token is invalid or belongs to a different Firebase project.',
        });
        return;
      }

      req.user = {
        uid: claims.uid,
        firebaseProjectId: claims.aud,
        email: typeof claims.email === 'string' ? claims.email : null,
        name: typeof claims.name === 'string' ? claims.name : null,
      };
      next();
    } catch (error) {
      const code = error?.code;
      const message = typeof error?.message === 'string' ? error.message : '';
      const reason = code === 'auth/id-token-expired'
        ? 'expired_token'
        : code === 'auth/id-token-revoked'
          ? 'revoked_token'
          : /audience|issuer|project/i.test(message)
            ? 'firebase_project_mismatch'
            : 'invalid_token';
      logAuthRejection(reason, error);
      res.status(401).json({
        success: false,
        code: reason === 'expired_token' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        message: reason === 'expired_token'
          ? 'The Firebase ID token has expired. Refresh your session and try again.'
          : 'The Firebase ID token is invalid or belongs to a different Firebase project.',
      });
    }
  };
}

export function requireAdmin(adminUids = []) {
  const configuredUids = new Set(
    adminUids.map((uid) => String(uid).trim()).filter(Boolean),
  );
  return (req, res, next) => {
    if (!req.user?.uid) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }
    if (!configuredUids.has(req.user.uid)) {
      res.status(403).json({
        success: false,
        message: 'Administrator access is not authorized.',
      });
      return;
    }
    next();
  };
}
