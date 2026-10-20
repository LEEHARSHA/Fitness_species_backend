const projectId = () => process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c';

export function requireFirebaseAuth(verifyIdToken) {
  return async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!match) {
      res.status(401).json({
        success: false,
        message: 'A valid Firebase ID token is required.',
      });
      return;
    }

    try {
      const claims = await verifyIdToken(match[1]);
      const expectedProject = projectId();
      if (
        !claims
        || typeof claims.uid !== 'string'
        || !claims.uid
        || claims.aud !== expectedProject
        || claims.iss !== `https://securetoken.google.com/${expectedProject}`
      ) {
        res.status(401).json({
          success: false,
          message: 'The Firebase ID token is invalid or belongs to an unsupported project.',
        });
        return;
      }

      req.user = {
        uid: claims.uid,
        email: typeof claims.email === 'string' ? claims.email : null,
        name: typeof claims.name === 'string' ? claims.name : null,
      };
      next();
    } catch {
      res.status(401).json({
        success: false,
        message: 'The Firebase ID token is invalid or expired.',
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
