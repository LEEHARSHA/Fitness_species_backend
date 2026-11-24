export async function createUserNotification(db, {
  firebaseProjectId,
  firebaseUid,
  eventKey,
  title,
  message,
  category,
  targetScreen,
  createdAt = new Date(),
}) {
  if (!firebaseProjectId || !firebaseUid || !eventKey || !title || !message || !category) {
    throw new Error('Notification event is missing required recipient or message fields.');
  }

  await db.collection('notifications').updateOne(
    { firebaseProjectId, firebaseUid, eventKey },
    {
      $setOnInsert: {
        firebaseProjectId,
        firebaseUid,
        eventKey,
        title,
        message,
        category,
        isRead: false,
        targetScreen: targetScreen || null,
        createdAt,
      },
    },
    { upsert: true },
  );
}
