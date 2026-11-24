import { ObjectId } from 'mongodb';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const idOf = (val) => new ObjectId(val);
const hasId = (val) => /^[a-f\d]{24}$/i.test(val || '') && ObjectId.isValid(val);
const pageLimit = 100;
const pageMaximum = 100;
const categoryPatterns = {
  appointments: /^(appointments?|doctor|medical)$/i,
  orders: /^(orders?|shop|payment)$/i,
  challenges: /^(challenges?|community)$/i,
  fitness: /^(fitness|workout|diet|water|steps?|streak|general)$/i,
};

function readPage(query) {
  const page = query.page === undefined
    ? 1
    : typeof query.page === 'string' && /^\d+$/.test(query.page)
      ? Number(query.page)
      : Number.NaN;
  const limit = query.limit === undefined
    ? 100
    : typeof query.limit === 'string' && /^\d+$/.test(query.limit)
      ? Number(query.limit)
      : Number.NaN;
  if (
    !Number.isInteger(page) || page < 1 || page > pageMaximum
    || !Number.isInteger(limit) || limit < 1 || limit > pageLimit
  ) return null;
  return { page, limit };
}

function notificationDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortNewestFirst(left, right) {
  const difference = notificationDate(right.createdAt) - notificationDate(left.createdAt);
  return difference || right.id.localeCompare(left.id);
}

export function createNotificationControllers({ getDb }) {
  const collection = (name) => getDb().collection(name);

  const getNotifications = asyncRoute(async (req, res) => {
    const pagination = readPage(req.query);
    if (!pagination) {
      res.status(400).json({ success: false, message: 'Page or limit is outside the supported range.' });
      return;
    }

    const category = req.query.category === undefined
      ? 'all'
      : typeof req.query.category === 'string'
        ? req.query.category.toLowerCase()
        : null;
    if (!category || (category !== 'all' && !Object.hasOwn(categoryPatterns, category))) {
      res.status(400).json({ success: false, message: 'Unsupported notification category.' });
      return;
    }

    const { page, limit } = pagination;
    const offset = (page - 1) * limit;
    const { firebaseProjectId, uid } = req.user;
    const standardOwner = firebaseProjectId === 'sellerportal-2786c'
      ? {
        $and: [
          { firebaseUid: uid },
          {
            $or: [
              { firebaseProjectId },
              { firebaseProjectId: { $exists: false } },
            ],
          },
        ],
      }
      : { firebaseProjectId, firebaseUid: uid };
    const standardFilter = category === 'all'
      ? standardOwner
      : { $and: [standardOwner, { category: categoryPatterns[category] }] };
    const portalOwner = {
      recipientFirebaseProjectId: firebaseProjectId,
      recipientFirebaseUid: uid,
      isActive: { $ne: false },
      $or: [{ scheduledFor: null }, { scheduledFor: { $lte: new Date() } }],
    };
    const portalFilter = category === 'all' || category === 'appointments'
      ? portalOwner
      : { ...portalOwner, _id: { $in: [] } };

    const standardUnreadFilter = {
      ...standardOwner,
      isRead: { $ne: true },
    };
    const portalUnreadFilter = {
      ...portalOwner,
      readAt: null,
    };
    const fetchLimit = offset + limit;
    const [
      standardItems,
      portalItems,
      standardTotal,
      portalTotal,
      standardUnread,
      portalUnread,
    ] = await Promise.all([
      collection('notifications').find(standardFilter)
        .sort({ createdAt: -1, _id: -1 }).limit(fetchLimit).toArray(),
      collection('doctorPortalNotifications').find(portalFilter)
        .sort({ createdAt: -1, _id: -1 }).limit(fetchLimit).toArray(),
      collection('notifications').countDocuments(standardFilter),
      collection('doctorPortalNotifications').countDocuments(portalFilter),
      collection('notifications').countDocuments(standardUnreadFilter),
      collection('doctorPortalNotifications').countDocuments(portalUnreadFilter),
    ]);

    const combined = [
      ...standardItems.map((notification) => ({
        id: notification._id.toString(),
        source: 'notifications',
        title: notification.title,
        message: notification.message || '',
        category: notification.category || 'Fitness',
        isRead: Boolean(notification.isRead),
        targetScreen: notification.targetScreen || null,
        createdAt: notification.createdAt,
      })),
      ...portalItems.map((notification) => ({
        id: notification._id.toString(),
        source: 'doctorPortalNotifications',
        title: notification.title,
        message: notification.body || '',
        category: 'Appointments',
        isRead: Boolean(notification.readAt),
        targetScreen: 'my_appointments',
        createdAt: notification.createdAt,
      })),
    ].sort(sortNewestFirst);
    const formattedList = combined.slice(offset, offset + limit);
    const total = standardTotal + portalTotal;

    res.json({
      success: true,
      count: formattedList.length,
      total,
      page,
      limit,
      hasMore: offset + formattedList.length < total,
      unreadCount: standardUnread + portalUnread,
      notifications: formattedList,
    });
  });

  const markNotificationAsRead = asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!hasId(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }
    if (
      req.query.source !== undefined
      && !['notifications', 'doctorPortalNotifications'].includes(req.query.source)
    ) {
      res.status(400).json({ success: false, message: 'Unsupported notification source.' });
      return;
    }

    if (req.query.source === 'doctorPortalNotifications') {
      const notification = await collection('doctorPortalNotifications').findOneAndUpdate(
        {
          _id: idOf(id),
          recipientFirebaseProjectId: req.user.firebaseProjectId,
          recipientFirebaseUid: req.user.uid,
          isActive: { $ne: false },
        },
        { $set: { readAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!notification) {
        res.status(404).json({ success: false, message: 'Notification was not found.' });
        return;
      }
    } else {
      const owner = req.user.firebaseProjectId === 'sellerportal-2786c'
        ? {
          firebaseUid: req.user.uid,
          $or: [
            { firebaseProjectId: req.user.firebaseProjectId },
            { firebaseProjectId: { $exists: false } },
          ],
        }
        : { firebaseProjectId: req.user.firebaseProjectId, firebaseUid: req.user.uid };
      const updated = await collection('notifications').updateOne(
        { _id: idOf(id), ...owner },
        { $set: { isRead: true, readAt: new Date() } },
      );
      if (!updated.matchedCount) {
        res.status(404).json({ success: false, message: 'Notification was not found.' });
        return;
      }
    }

    res.json({ success: true, message: 'Notification marked as read.' });
  });

  const markAllAsRead = asyncRoute(async (req, res) => {
    const standardOwner = req.user.firebaseProjectId === 'sellerportal-2786c'
      ? {
        $and: [
          { firebaseUid: req.user.uid },
          {
            $or: [
              { firebaseProjectId: req.user.firebaseProjectId },
              { firebaseProjectId: { $exists: false } },
            ],
          },
        ],
      }
      : { firebaseProjectId: req.user.firebaseProjectId, firebaseUid: req.user.uid };
    await Promise.all([
      collection('notifications').updateMany(
        { ...standardOwner, isRead: { $ne: true } },
        { $set: { isRead: true, readAt: new Date() } },
      ),
      collection('doctorPortalNotifications').updateMany(
        {
          recipientFirebaseProjectId: req.user.firebaseProjectId,
          recipientFirebaseUid: req.user.uid,
          isActive: { $ne: false },
          readAt: null,
        },
        { $set: { readAt: new Date() } },
      ),
    ]);

    res.json({ success: true, message: 'All notifications marked as read.' });
  });

  const deleteNotification = asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!hasId(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }
    if (
      req.query.source !== undefined
      && !['notifications', 'doctorPortalNotifications'].includes(req.query.source)
    ) {
      res.status(400).json({ success: false, message: 'Unsupported notification source.' });
      return;
    }

    if (req.query.source === 'doctorPortalNotifications') {
      const deleted = await collection('doctorPortalNotifications').updateOne(
        {
          _id: idOf(id),
          recipientFirebaseProjectId: req.user.firebaseProjectId,
          recipientFirebaseUid: req.user.uid,
          isActive: { $ne: false },
        },
        { $set: { isActive: false } },
      );
      if (!deleted.matchedCount) {
        res.status(404).json({ success: false, message: 'Notification was not found.' });
        return;
      }
    } else {
      const owner = req.user.firebaseProjectId === 'sellerportal-2786c'
        ? {
          firebaseUid: req.user.uid,
          $or: [
            { firebaseProjectId: req.user.firebaseProjectId },
            { firebaseProjectId: { $exists: false } },
          ],
        }
        : { firebaseProjectId: req.user.firebaseProjectId, firebaseUid: req.user.uid };
      const deleted = await collection('notifications').deleteOne({
        _id: idOf(id),
        ...owner,
      });
      if (!deleted.deletedCount) {
        res.status(404).json({ success: false, message: 'Notification was not found.' });
        return;
      }
    }

    res.json({ success: true, message: 'Notification deleted.' });
  });

  return {
    getNotifications,
    markNotificationAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
