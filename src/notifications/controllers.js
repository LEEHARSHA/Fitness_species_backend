import { ObjectId } from 'mongodb';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const idOf = (val) => new ObjectId(val);
const hasId = (val) => /^[a-f\d]{24}$/i.test(val || '') && ObjectId.isValid(val);

export function createNotificationControllers({ getDb }) {
  const collection = (name) => getDb().collection(name);

  // 1. GET USER NOTIFICATIONS
  const getNotifications = asyncRoute(async (req, res) => {
    const list = await collection('notifications')
      .find({ firebaseUid: req.user.uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const unreadCount = list.filter((n) => !n.isRead).length;

    const formattedList = list.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      message: n.message,
      category: n.category || 'General',
      isRead: Boolean(n.isRead),
      targetScreen: n.targetScreen || null,
      createdAt: n.createdAt,
    }));

    res.json({
      success: true,
      count: formattedList.length,
      unreadCount,
      notifications: formattedList,
    });
  });

  // 2. MARK SINGLE AS READ
  const markNotificationAsRead = asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!hasId(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }

    await collection('notifications').updateOne(
      { _id: idOf(id), firebaseUid: req.user.uid },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ success: true, message: 'Notification marked as read.' });
  });

  // 3. MARK ALL AS READ
  const markAllAsRead = asyncRoute(async (req, res) => {
    await collection('notifications').updateMany(
      { firebaseUid: req.user.uid, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ success: true, message: 'All notifications marked as read.' });
  });

  // 4. DELETE NOTIFICATION
  const deleteNotification = asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!hasId(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }

    await collection('notifications').deleteOne({
      _id: idOf(id),
      firebaseUid: req.user.uid,
    });

    res.json({ success: true, message: 'Notification deleted.' });
  });

  // 5. CREATE NOTIFICATION (INTERNAL)
  const createNotification = asyncRoute(async (req, res) => {
    const { title, message, category, targetScreen } = req.body || {};

    if (!title || !message) {
      res.status(400).json({ success: false, message: 'Title and message are required.' });
      return;
    }

    const doc = {
      firebaseUid: req.user.uid,
      title,
      message,
      category: category || 'General',
      isRead: false,
      targetScreen: targetScreen || null,
      createdAt: new Date(),
    };

    await collection('notifications').insertOne(doc);

    res.json({ success: true, message: 'Notification created successfully.', notification: doc });
  });

  return {
    getNotifications,
    markNotificationAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification,
  };
}
